-- Creates a require function scoped to the calling script. Example:
-- local requireFrom = require(game:GetService("ReplicatedStorage").Import)(script)
-- local Messages = requireFrom("@Systems/GreetingSystem/Shared/Messages")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local CustomRequirer = require(ReplicatedStorage.Core.Shared.CustomRequirer)
local SystemRoutes = require(ReplicatedStorage.Core.Shared.CustomRequirer.SystemRoutes)

local ancestors: { [string]: Instance } = {
   Core = ReplicatedStorage.Core,
   Systems = ReplicatedStorage.Systems,
}

if not RunService:IsClient() then
   local ServerScriptService = game:GetService("ServerScriptService")

   -- capataz-ignore dynamic-requirer: canonical Import factory routes server aliases.
   return CustomRequirer.new({
      Ancestors = ancestors,
      ServiceRoutes = SystemRoutes,
      CaseSensitive = true,
      RootResolver = function(alias: string, segments: { string }, _context: Instance): (Instance?, number?)
         if string.lower(alias) == "core" and string.lower(segments[1] or "") == "server" then
            return ServerScriptService.Core.Server, 1
         end
         return nil
      end,
   })
end

return CustomRequirer.new({
   Ancestors = ancestors,
   ServiceRoutes = SystemRoutes,
   CaseSensitive = true,
})
