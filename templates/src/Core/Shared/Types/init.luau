--!nolint BuiltinGlobalWrite
do -- ## CUSTOM REQUIRER ## --
   local Import = require(game:GetService("ReplicatedStorage").Import)
   require = Import(script)
end

local Janitor = require("@Packages/Janitor")
local Promise = require("@Packages/Promise")
local TableManager = require("@Packages/TableManager")


export type Janitor = Janitor.Janitor
export type TableManager<T> = TableManager.TableManager<T>
export type Promise<T...> = Promise.TypedPromise<T...>
export type AnyPromise = Promise.Promise


local VALIDATE = {}

local Types = {
   VALIDATE = VALIDATE,
}

-----------------------------------------------------------------------

return Types
