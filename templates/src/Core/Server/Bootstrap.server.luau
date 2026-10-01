local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local services = {}
for _, root in { ServerScriptService.Core.Server, ServerScriptService.Systems } do
   for _, module in root:GetDescendants() do
      if module:IsA("ModuleScript") and module.Name:match("Service$") then
         -- capataz-ignore dynamic-require: bootstrap discovers services by suffix.
         table.insert(services, { module = module, value = require(module) })
      end
   end
end
table.sort(services, function(a, b)
   local aPriority, bPriority = a.value.Priority or 0, b.value.Priority or 0
   if aPriority == bPriority then
      return a.module:GetFullName() < b.module:GetFullName()
   end
   return aPriority > bPriority
end)
for _, service in services do
   if type(service.value.Init) == "function" then
      service.value.Init()
   end
end
for _, service in services do
   if type(service.value.Start) == "function" then
      service.value.Start()
   end
end
