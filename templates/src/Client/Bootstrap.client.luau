local ReplicatedStorage = game:GetService("ReplicatedStorage")

local controllers = {}
for _, root in { ReplicatedStorage.Core.Client, ReplicatedStorage.Systems } do
   for _, module in root:GetDescendants() do
      if module:IsA("ModuleScript") and module.Name:match("Controller$") then
         -- capataz-ignore dynamic-require: bootstrap discovers controllers by suffix.
         table.insert(controllers, { module = module, value = require(module) })
      end
   end
end
table.sort(controllers, function(a, b)
   local aPriority, bPriority = a.value.Priority or 0, b.value.Priority or 0
   if aPriority == bPriority then
      return a.module:GetFullName() < b.module:GetFullName()
   end
   return aPriority > bPriority
end)
for _, controller in controllers do
   if type(controller.value.Init) == "function" then
      controller.value.Init()
   end
end
for _, controller in controllers do
   if type(controller.value.Start) == "function" then
      controller.value.Start()
   end
end
