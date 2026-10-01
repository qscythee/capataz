local __IMPORT = require(game:GetService("ReplicatedStorage").Import)
require = __IMPORT(script)
local Messages = require("@Systems/GreetingSystem/Shared/Messages")
local CounterController = require("@Systems/CounterSystem/Client/CounterController")

local GreetingController = {}

function GreetingController.Start()
	print(Messages.Greeting, "counter service counter:", CounterController.CountNext())
end

return GreetingController
