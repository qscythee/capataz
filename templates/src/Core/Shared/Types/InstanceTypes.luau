export type function childrenof(t: type)
   if not t:is("extern") then
      error("childrenof can only be used on type extern (roblox objects)")
   end

   local properties = t:properties()
   local children: { [type]: { read: type?, write: type? } } = {}
   local builtinInstanceKeys = {
      Parent = true,
      Name = true,
      ClassName = true,
   }

   for index, indexer in properties do
      local keyValue = if index:is("singleton") then index:value() else nil

      if
         index:is("singleton")
         and type(keyValue) == "string"
         and not builtinInstanceKeys[keyValue]
         and indexer.read
         and indexer.read:is("extern")
      then
         children[index] = indexer
      end
   end

   return types.newtable(children)
end

return nil
