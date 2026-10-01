local Counter = {}

function Counter.next(starting: number?): () -> number
	local running = starting or 0
	return function(): number
		running += 1
		return running
	end
end

return Counter
