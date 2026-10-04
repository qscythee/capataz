local Systems = game:GetService("ServerScriptService"):WaitForChild("Systems")

type Startable = {
	Start: () -> (),
}

local startables: { Startable } = {}
local modules = {}

for _, descendant in Systems:GetDescendants() do
	if descendant:IsA("ModuleScript") and string.sub(descendant.Name, -7) == "Service" then
		table.insert(modules, descendant)
	end
end

table.sort(modules, function(a, b)
	return a:GetFullName() < b:GetFullName()
end)

for _, moduleScript in modules do
	local service = require(moduleScript)
	if type(service) == "table" and type(service.Start) == "function" then
		table.insert(startables, service)
	else
		warn(("[Capataz] Service %s must return a table with Start()"):format(moduleScript:GetFullName()))
	end
end

for _, service in startables do
	service.Start()
end
