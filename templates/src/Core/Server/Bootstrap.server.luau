local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Nexus = require(ReplicatedStorage.Packages.Nexus)

Nexus.RegisterProvidersIn(script.Parent :: Folder, Nexus.Predicates.IsService)
Nexus.RegisterProvidersIn(ServerScriptService.Systems, Nexus.Predicates.IsService)

Nexus.Start()
   :andThen(function()
      print("Nexus started successfully!")
   end)
   :catch(function(err)
      warn(`Nexus failed to start: {err}`)
   end)
