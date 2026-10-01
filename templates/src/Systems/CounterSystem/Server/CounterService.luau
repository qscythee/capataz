local __IMPORT = require(game:GetService("ReplicatedStorage").Import)
require = __IMPORT(script)
local Counter = require("@Systems/CounterSystem/Shared/Counter")

local counter = Counter.next(0)

local CounterService = {}

function CounterService.CountNext(): number
	return counter()
end

function CounterService.Start()
	print("Server counter:", CounterService.CountNext())
end

return CounterService
