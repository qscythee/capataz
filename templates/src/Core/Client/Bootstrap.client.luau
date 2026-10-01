local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Nexus = require(ReplicatedStorage.Packages.Nexus)

Nexus.RegisterProvidersIn(script.Parent :: Folder, Nexus.Predicates.IsController)
Nexus.RegisterProvidersIn(ReplicatedStorage.Systems, Nexus.Predicates.IsController)

Nexus.Start()
   :andThen(function()
      print("Nexus started successfully!")
   end)
   :catch(function(err)
      warn(`Nexus failed to start: {err}`)
   end)
