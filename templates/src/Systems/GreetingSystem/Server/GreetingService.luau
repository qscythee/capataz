local __IMPORT = require(game:GetService("ReplicatedStorage").Import)
require = __IMPORT(script)
local Messages = require("@Systems/GreetingSystem/Shared/Messages")
local CounterService = require("@Systems/CounterSystem/Server/CounterService")

local GreetingService = {}

function GreetingService.Start()
	print(Messages.Greeting, "counter service counter:", CounterService.CountNext())
end

return GreetingService
