local __IMPORT = require(game:GetService("ReplicatedStorage").Import)
require = __IMPORT(script)
local Counter = require("@Systems/CounterSystem/Shared/Counter")

local counter = Counter.next(0)

local CounterController = {}

function CounterController.CountNext(): number
	return counter()
end

function CounterController.Start()
	print("Client counter:", CounterController.CountNext())
end

return CounterController
