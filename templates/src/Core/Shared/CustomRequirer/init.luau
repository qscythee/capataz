export type Require = typeof(require)
export type ContextualImportGenerator = (Instance) -> Require
export type RootResolver = (alias: string, pathSegments: { string }, context: Instance) -> (Instance?, number?)

export type Config = {
   Ancestors: { [string]: Instance },
   Aliases: { [string]: string }?,
   RootResolver: RootResolver?,
   IgnorePredicate: ((Instance) -> boolean)?,
   Debug: boolean?,
   MaxSearchDepth: number?,
   CaseSensitive: boolean?,
   TrackPerformance: boolean?,
   CircularDependencyDetection: boolean?,
   MicroprofilerEnabled: boolean?,
}

local CustomRequirer = {}

function CustomRequirer.new(config: Config)
   local Ancestors = config.Ancestors
   local Aliases = config.Aliases or {}
   local RootResolver = config.RootResolver
   local IgnorePredicate: (Instance) -> boolean = config.IgnorePredicate or function(_instance: Instance)
      return false
   end
   local Debug = config.Debug or false
   local _MaxSearchDepth = config.MaxSearchDepth or math.huge
   local CaseSensitive = config.CaseSensitive or false
   local _TrackPerformance = config.TrackPerformance or false
   local _CircularDependencyDetection = if config.CircularDependencyDetection == nil
      then true
      else config.CircularDependencyDetection
   local _MicroprofilerEnabled = config.MicroprofilerEnabled or false

   -- Internal state for the requirer.
   local _moduleCache: { [Instance]: any } = {}
   local _performanceData: { [Instance]: number } = {}
   local _circularDependencyStack: { [Instance]: boolean } = {}

   local ancestorByLower: { [string]: Instance } = {}
   for name, inst in Ancestors do
      ancestorByLower[string.lower(name)] = inst
   end

   local function debugLog(...)
      if Debug then
         print("[CustomRequirer]", ...)
      end
   end

   local function splitPath(path: string): { string }
      local parts = {}
      for part in string.gmatch(path, "[^/]+") do
         table.insert(parts, part)
      end
      return parts
   end

   local function findChild(parent: Instance, childName: string): Instance?
      local direct = parent:FindFirstChild(childName)
      if direct then
         return direct
      end

      if CaseSensitive then
         return nil
      end

      local lowered = string.lower(childName)
      for _, child in parent:GetChildren() do
         if string.lower(child.Name) == lowered then
            return child
         end
      end

      return nil
   end

   local function resolveAlias(alias: string): Instance
      local exact = Ancestors[alias]
      if exact then
         return exact
      end

      local lower = ancestorByLower[string.lower(alias)]
      if lower then
         return lower
      end

      error(("[CustomRequirer] Unknown ancestor alias '@%s'"):format(alias))
   end

   local function resolveAtPath(context: Instance, specifier: string): ModuleScript
      -- Supports: @alias/Segment/Segment/Module
      local slashIndex = string.find(specifier, "/", 2, true)
      local alias: string
      local remainder: string
      if slashIndex then
         alias = string.sub(specifier, 2, slashIndex - 1)
         remainder = string.sub(specifier, slashIndex + 1)
      else
         alias = string.sub(specifier, 2)
         remainder = ""
      end

      if Aliases[alias] then
         -- Reserved for future: string alias rewriting
         debugLog("Alias rewrite not implemented, ignoring Aliases entry for", alias)
      end

      local segments: { string } = {}
      if remainder ~= "" then
         segments = splitPath(remainder)
      end

      local current: Instance
      local firstSegment = 1
      if RootResolver then
         local redirectedRoot, consumedSegments = RootResolver(alias, segments, context)
         current = redirectedRoot or resolveAlias(alias)
         if redirectedRoot then
            firstSegment += consumedSegments or 0
         end
      else
         current = resolveAlias(alias)
      end

      for index = firstSegment, #segments do
         local segment = segments[index]
         if segment == "." or segment == "" then
            continue
         elseif segment == ".." then
            if not current.Parent then
               error(("[CustomRequirer] Path '%s' tried to go above root '%s'"):format(specifier, current.Name))
            end
            current = current.Parent
         else
            local nextInst = findChild(current, segment)
            if not nextInst then
               error(
                  ("[CustomRequirer] Could not resolve '%s' (missing '%s' under %s)"):format(
                     specifier,
                     segment,
                     current:GetFullName()
                  )
               )
            end
            current = nextInst
         end
      end

      if IgnorePredicate(current) then
         debugLog("Resolved to ignored instance:", current:GetFullName())
      end

      if current:IsA("ModuleScript") then
         return current
      end

      error(
         ("[CustomRequirer] Resolved '%s' to %s (%s), expected ModuleScript"):format(
            specifier,
            current.ClassName,
            current:GetFullName()
         )
      )
   end

   local function resolveRelativePath(context: Instance, specifier: string): ModuleScript
      if specifier == "" then
         error("[CustomRequirer] Relative require path is empty")
      end

      local start = context.Parent
      if not start then
         error(
            ("[CustomRequirer] Cannot resolve relative path '%s' because context has no parent (%s)"):format(
               specifier,
               context:GetFullName()
            )
         )
      end

      local current: Instance = start
      for _, segment in splitPath(specifier) do
         if segment == "." or segment == "" then
            continue
         elseif segment == ".." then
            if not current.Parent then
               error(("[CustomRequirer] Relative path '%s' tried to go above root at %s"):format(specifier, current:GetFullName()))
            end
            current = current.Parent
         else
            local nextInst = findChild(current, segment)
            if not nextInst then
               error(
                  ("[CustomRequirer] Could not resolve relative '%s' (missing '%s' under %s)"):format(
                     specifier,
                     segment,
                     current:GetFullName()
                  )
               )
            end
            current = nextInst
         end
      end

      if IgnorePredicate(current) then
         debugLog("Resolved to ignored instance:", current:GetFullName())
      end

      if current:IsA("ModuleScript") then
         return current
      end

      error(
         ("[CustomRequirer] Resolved relative '%s' to %s (%s), expected ModuleScript"):format(
            specifier,
            current.ClassName,
            current:GetFullName()
         )
      )
   end

   local function createRequire(context: Instance): Require
      local robloxRequire = require

      return function(module: Instance | string)
         if typeof(module) == "Instance" then
            -- capataz-ignore dynamic-require: runtime Instance passthrough.
            return robloxRequire(module)
         end

         if type(module) == "string" then
            if string.sub(module, 1, 1) == "@" then
               local resolved = resolveAtPath(context, module)
               -- capataz-ignore dynamic-require: runtime alias resolution.
               return robloxRequire(resolved)
            end

            local resolved = resolveRelativePath(context, module)
            -- capataz-ignore dynamic-require: runtime relative resolution.
            return robloxRequire(resolved)
         end

         error(("[CustomRequirer] Unsupported require input type: %s"):format(typeof(module)))
      end
   end

   return createRequire
end

return CustomRequirer
