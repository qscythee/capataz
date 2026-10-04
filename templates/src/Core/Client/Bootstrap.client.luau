local Systems = game:GetService("ReplicatedStorage"):WaitForChild("Systems")

type Startable = {
	Start: () -> (),
}

local startables: { Startable } = {}
local modules = {}

for _, descendant in Systems:GetDescendants() do
	if descendant:IsA("ModuleScript") and string.sub(descendant.Name, -10) == "Controller" then
		table.insert(modules, descendant)
	end
end

table.sort(modules, function(a, b)
	return a:GetFullName() < b:GetFullName()
end)

for _, moduleScript in modules do
	-- Capataz(dynamic-require) Controllers are discovered at runtime.
	local controller = require(moduleScript)
	if type(controller) == "table" and type(controller.Start) == "function" then
		table.insert(startables, controller)
	else
		warn(("[Capataz] Controller %s must return a table with Start()"):format(moduleScript:GetFullName()))
	end
end

for _, controller in startables do
	controller.Start()
end
