// File: Maze.js


// Class: Path
// Paths describe the visual connections between nodes in the maze.
// They are described using a *spec* which contains a mixture of absolute and
// relative position information.  In addition, a colorfunction controls the 
// color of the path.
function Path(spec, colorfunction) {
	var points = spec.split(',')
	this.colorfunction = colorfunction
	this.path = new Array(points.length)
	this.path[0] = this.translate(points[0])
	this.start = this.end = null
	
	for(var i = 1; i < points.length; i++) {
		this.path[i] = this.step(points[i], this.path[i-1])
	}
	this.length = this.computeLength()
}

$.extend(Path.prototype, {
	// Function: draw
	draw: function(ctx,param,cf) {
		if(!cf) cf = this.colorfunction
		ctx.save()
		ctx.strokeStyle = cf(param)
		ctx.beginPath()
		ctx.moveTo(this.path[0][0], this.path[0][1])
		for(var i = 1; i < this.path.length; i++) {
			ctx.lineTo(this.path[i][0], this.path[i][1])
		}
		ctx.stroke()
		ctx.restore()
	},
	// Function: delta
	// Returns the delta between path point i and i+1.
	delta: function(i) {
		return [
			this.path[i+1][0] - this.path[i][0],
			this.path[i+1][1] - this.path[i][1] ]
	},
	// Function: computeLength
	// the length of the path in units.
	computeLength: function() {
		var len = 0
		this.lengths = [0]
		for(var i = 0; i < this.path.length-1; i++) {
			var d = this.delta(i)
			len += Math.sqrt(d[0]*d[0] + d[1]*d[1])
			this.lengths.push(len)
		}
		return len
	},
	// Function: interp
	// returns the linear position on the path 
	// parameterized by t from 0 to 1. 
	interp: function(t) {
		t *= this.length
		var i = 1
		while(i < this.lengths.length && this.lengths[i] <= t)
			i++

		if(i >= this.lengths.length) i = this.lengths.length - 1
		
		var len = this.lengths[i] - this.lengths[i-1]
		t -= this.lengths[i-1]
		t /= len
		return [
			this.path[i][0]*t + this.path[i-1][0]*(1 - t),
			this.path[i][1]*t + this.path[i-1][1]*(1 - t) ]
	},
	// Function: step
	// Used for construction the path.  
	// Computes a possibly relative position.
	// (code)
	//    count?[news] | absoluteposition
	//    e.g., w or 4n or CN3
	// (end code)
	step: function(point, lastpos) {
		if(typeof(point) === 'string') {
			var scale = 1
			var count = /^[0-9.]+/.exec(point)
			if(count) {
				scale = Number(count)
				point = point.slice(count.length)
			}
			if(point.indexOf('n') >= 0) return [lastpos[0], lastpos[1]-scale]
			else if(point.indexOf('s') >= 0) return [lastpos[0], lastpos[1]+scale]
			else if(point.indexOf('w') >= 0) return [lastpos[0]-scale, lastpos[1]]
			else if(point.indexOf('e') >= 0) return [lastpos[0]+scale, lastpos[1]]
			else return this.translate(point)
		}
		else return [point[0] + lastpos[0], point[1] + lastpos[1]]
	},
	// Function: translate
	// Computes an absolute position in a path spec.
	// (code)
	//   [ABC]?[NEWS][1-4]
	//   e.g., N3 or AW1
	// (end code)
	translate: function(point) {
		if(typeof(point) === 'string') {
			var pos = [0,0]
			if(point.indexOf('+') >= 0) {
				var aggregate = point.split('+')
				pos = this.translate(aggregate[0])
				for(var i = 1; i < aggregate.length; i++)
					pos = this.step(aggregate[i], pos)
				return pos
			}

			var dir = 0
			var scale = 1
			if(point.indexOf('A') >= 0) pos[0] +=  5, pos[1] +=  5
			else if(point.indexOf('B') >= 0) pos[0] += 15, pos[1] +=  5
			else if(point.indexOf('C') >= 0) pos[0] += 15, pos[1] += 15
			else if(point.indexOf('D') >= 0) pos[0] += 5 + 2.5 - 1, pos[1] += 15
			else scale = 5
			if(point.indexOf('N') >= 0) pos[0] +=  1*scale, dir = 0 
			if(point.indexOf('S') >= 0) pos[0] +=  1*scale, pos[1] += 5*scale, dir = 0 
			if(point.indexOf('W') >= 0) pos[1] +=  1*scale, dir = 1 
			if(point.indexOf('E') >= 0) pos[1] +=  1*scale, pos[0] += 5*scale, dir = 1
			if(point.indexOf('1') >= 0) pos[dir] += 0*scale
			if(point.indexOf('2') >= 0) pos[dir] += 1*scale
			if(point.indexOf('3') >= 0) pos[dir] += 2*scale
			if(point.indexOf('4') >= 0) pos[dir] += 3*scale
			point = pos
		}
		return point
	}
})



// Class: Node
// Nodes connect paths in the maze. 
// They have a cosmetic x and y and topological north/south/east/west
// actions which represent transitions from the node.
function Node(pos) {
	this.x = pos[0]
	this.y = pos[1]
	this.north = this.south = this.west = this.east = null
}


// Class: Maze
// Creates a canvas object and makes it into a recursive maze.
// The maze contains three copies of itself, originally named A, B, and C 
// (clockwise from top left).  Despite its small size, solving this maze 
// seems to require going at least 4 descents deep into the copies.
//
// The maze object has a lot of state:
// There are the *paths* and map of *nodes* that define the maze,
// and then there's a *traversing* stack/graph and current *node*, 
// a *camera* status, a *player* position among other things.
//
// Drawing is done using two intervals, a draw update thread and a drawing thread which
// 'asynchonously' pulls the last draw action and executes it.
function Maze($where, size) {
	$where.next().css({clear:'left'})
	
	var $canvas = $where.find('canvas')
	$canvas.attr({width:size, height:size})
	$canvas.css({float:'left'})
	this.$log = $where.find('div')
	var ctx = this.ctx = $canvas[0].getContext('2d')
	
	var margin = size/20
	this.scale = (size - 2*margin)/25
	ctx.translate(margin, margin)
	ctx.scale(this.scale, this.scale)
	this.definePaths()
	this.reset()

	this.drawThread = setInterval(new function(maze) { return function() {
		if(maze.drawaction) maze.drawaction()
		maze.drawaction = null
	}}(this), $.browser.msie ? 1000/2 : 1000/60)
	this.drawUpdateThread = setInterval(new function(maze) { 
		function zoom(maze, level, t) {
			var target = maze.offset(level.box)
			var old_scale = maze.scale

			ctx.save()
				maze.scale = old_scale * (t*t*4+1)
				ctx.scale(t*t*4+1,t*t*4+1)
				ctx.translate(-t*(target[0]),-t*(target[1]))
				maze.draw(level.up)
				ctx.translate(target[0],target[1])
				ctx.scale(1/5,1/5)
				maze.scale *= 1/5
				maze.drawMaze(maze.ctx, level)
			ctx.restore()
			maze.scale = old_scale
		}
		return function() {
			var camera = maze.camera
			while(camera.target[1] == camera.target[0]) {
				camera.target.shift()
			}
			if(camera.target.length > 1 && camera.interp >= 1) {
				if(!(maze.replay.length && camera.target.length == 2 && camera.target[1].up == camera.target[0])) {
					camera.interp = 0
				}
			}
			if(camera.interp < 1) {
				if(camera.interp < 0) camera.interp = 0
				if(camera.target[2] == camera.target[0] && camera.target[2].depth < camera.target[1].depth) {
					camera.target.shift()
					camera.interp = 1-camera.interp
					if(camera.interp >= 1) camera.interp = 1 - 0.001
				}
				var level = camera.target[1]
				var t = camera.interp
				var speed = 0.03
				if(camera.target[1] == camera.target[0].up) {
					t = 1-t
					level = camera.target[0]
				}
				if(camera.target[1].depth <= camera.target[0].depth)
					speed = 0.08
				maze.drawaction = new function(maze,level,t) { return function() { 
					zoom(maze, level, t) } } (maze,level,t)
				camera.interp += speed*(camera.target.length-1)
				if(camera.interp >= 1) {
					camera.interp = 1
					camera.target.shift()
				}
				maze.redraw = true
			} else if(maze.redraw) {
				maze.drawaction = function() { maze.draw(camera.target[0]) }
				maze.redraw = 0
			}
		}
	}(this), 1000/30)
}

$.extend(Maze.prototype, {
	// Function: getNode
	// Utility routine that gets the node at a given location in the grid
	getNode: function(at) {
		var loc = Path.prototype.translate(at)
		var index = loc[0] + loc[1]*25
		if(this.nodes[index])
			return this.nodes[index]
		else {
			this.nodes[index] = new Node(loc)
			return this.nodes[index]
		}
	},
	// Function: reset
	// resets the maze to the initial state
	reset: function() {
		this.stack = []
		this.traversing = {paths:[], depth:0}
		this.animate = true
		this.follow_linearpath = true
		this.replay = []
		this.record = []
		this.node = this.start
		this.player = [this.node.x, this.node.y]
		this.camera = {target:[this.traversing], interp:1}
		this.drawaction = undefined
		this.redraw = true
	},
	// Function: definePaths
	// Initializes the maze structure.
	// First it parses all the paths, then it sets up all the enter and exit nodes,
	// then it hooks up the paths to all the nodes (generating interior nodes as necessary).
	definePaths: function() {
		var red = function(on) { return on ? 'rgb(255,0,0)' : 'rgb(100,0,0)' }
		var green = function(on) { return on ? 'rgb(0,255,0)' : 'rgb(0,100,0)' }
		var blue = function(on) { return on ? 'rgb(0,0,255)' : 'rgb(0,0,100)' }
		var gray = function(on) { return on ? 'rgb(128,128,128)' : 'rgb(80,80,80)' }
		this.paths = []
		var redpaths = [
			'N1,s,3w,2s',
			'N1+s+3w+2s,4e,2s',
			'N1+s+3w+2s,2s',
			'N1+s+3w+2s+2s,2w',
			'N1+s+3w+2s+2s,5s,2w',
			'N2,s,w,4s',
			'N4,s,4w,4s',
			'E1,w,2n,5w,BN4',
			'E2,4w,1n,1w',
			'W3+4e,7n,AW3',
			'W3,4e',
			'W3+4e,9s,6e,1s',
			'CE4,2e,n,2w',
			'CW2,w,9n,e',
			'CW4,4w,5n,2w,4n',
			'AE4,3e,3n,2e'
		]
		var greenpaths = [
			'AW1,2w,5s,5e,n',
			'S1,2n,7e,10n',
			'S1+2n+7e+10n,7n',
			'S1+2n+7e+17n,2w',
			'CN1,2n',
			'BE3,2e,5s,6w',
			'BE3+2e+5s+6w,4w',
			'N3,1s,3w,5s',
			'BN3,3n,5e,21s,3w,S4'
		]
		var bluepaths = [
			'S3,4n',
			'S3+4n,7e,n,E4',
			'W4,3e,s,10e',
			'W4+3e+s+10e,2e',
			'AS2,2s,6e,9s',
			'BS2,4s,2e,1s',
			'AN3,1n,13e,3s,3e,8s',
			'E3,w',
			'CE2,2e,2n,2e'
		]
		var specialpaths = [
			'DN0,n,1.5w,AS1',
			'DS0,2s,10.5e,CS3'
		]
		for(var pi in redpaths) this.paths.push(new Path(redpaths[pi], red))
		for(var pi in greenpaths) this.paths.push(new Path(greenpaths[pi], green))
		for(var pi in bluepaths) this.paths.push(new Path(bluepaths[pi], blue))
		this.nodes = new Object()
		var directions = this.directions = [
			['N', 'north'], 
			['S', 'south'],
			['W', 'west'], 
			['E', 'east'] ]
		function path_direction(path, index) {
			if(!index) index = 0
			var delta = [
				path.path[index+1][0] - path.path[index][0],
				path.path[index+1][1] - path.path[index][1] ]
			if(delta[1] < 0) return 0
			if(delta[1] > 0) return 1
			if(delta[0] < 0) return 2
			if(delta[0] > 0) return 3
		}
		function path_end_direction(path) {
			return path_direction(path, path.path.length-2) ^ 1
		}
		var boxes = ['A','B','C']
		for(var d in directions)
		for(var x = 1; x <= 4; x++)
		{
			var loc = Path.prototype.translate(directions[d][0] + x)
			var node = this.nodes[loc[0] + loc[1]*25] = new Node(loc)
			
			node[directions[d][1]] = new function(maze,loc,d) { 
				return function() { maze.exit(loc, d) } 
				}(this,loc,d)
		}

		for(var box in boxes)
		for(var d in directions)
		for(var x = 0; x <= 4; x++)
		{
			var node = this.getNode(boxes[box] + directions[d][0] + x)
			node[directions[1^d][1]] = new function(maze,box,node,d) {
				return function() { maze.enter(box, node, d) }}
				(this, boxes[box], this.getNode(directions[d][0] + x), 1^d)
		}

		for(var pi in this.paths) {
			var path = this.paths[pi]
			var start = path.path[0][0] + path.path[0][1]*25
			var end = path.path[path.path.length-1][0] + path.path[path.path.length-1][1]*25
			var start_node = this.nodes[start]
			var end_node = this.nodes[end]
			if(!start_node) start_node = this.nodes[start] = new Node(path.path[0])
			if(!end_node) end_node = this.nodes[end] = new Node(path.path[path.path.length-1])
			var start_dir = path_direction(path)
			var end_dir = path_end_direction(path)
			start_node[directions[start_dir][1]] = new function(maze, path, dir) {
				return function() { maze.traverse(path, dir) } } (this, path, 1^end_dir)
			
			end_node[directions[end_dir][1]] = new function(maze, path, dir) {
				return function() { maze.traverse(path, dir, true) } } (this, path, 1^start_dir)
			path.start = start_node
			path.end = end_node
		}

		this.specialpaths = []
		for(var pi in specialpaths) this.specialpaths.push(new Path(specialpaths[pi], gray)) 
		var startingnode = this.start = this.nodes[-1] = new Node([5 + 2.5, 15])
		var endingnode = this.nodes[-2] = new Node([5 + 2.5, 20])
		this.specialpaths[0].start = startingnode
		this.specialpaths[1].start = endingnode
		var NORTH = 0
		var SOUTH = 1
		startingnode.north = new function(maze,path) { 
			return function() { maze.traverse(path, NORTH) } }(this, this.specialpaths[0])
		endingnode.south = new function(maze,path){
			return function() { maze.traverse(path, SOUTH) } }(this, this.specialpaths[1])
		var end0 = this.specialpaths[0].end = this.getNode('AS1')
		end0.south = new function(maze,path) { 
			return function() { maze.traverse(path, SOUTH, true) } }(this, this.specialpaths[0])
		var end1 = this.specialpaths[1].end = this.getNode('CS3')
		end1.south = new function(maze,path) {
			return function() { maze.traverse(path, NORTH, true, function() { 
				maze.node = startingnode
				maze.replay = maze.record
				maze.record = []
				maze.animate = true
 				maze.auto(0) 
			}) } }(this, this.specialpaths[1])
		this.node = startingnode
		this.player = [startingnode.x, startingnode.y]
	},
	// Function: boxcolor
	boxcolor: function(box) {
		return box == 'A' ? 'rgb(128,0,0)' :
		       box == 'B' ? 'rgb(0,128,0)' :
		       box == 'C' ? 'rgb(0,0,128)' : 'rgb(0,0,0)'
	},
	// Function: offset
	// utility routine that gets the offset of 
	// an inner maze. A is the upper left, 
	// then B on the upper right, and C on the lower left.
	offset: function(box) {
		 return box == 'A' ? [ 5, 5] :
		 	    box == 'B' ? [15, 5] : [15,15]
	},
	// Function: enter
	// Node action for entering a subcopy of the maze.
	// Updates the *traversing* graph
	enter: function(box, node, dir) {
		if(undefined == this.traversing[box]) {
			var traversing = {up:this.traversing, paths:[], box:box, depth:this.traversing.depth+1}
			this.traversing[box] = traversing
		}

		this.traversing = this.traversing[box]
		this.camera.target.push(this.traversing)
		this.player = [node.x, node.y]
		this.node = node
		this.auto(dir)
	},
	// Function: exit
	// Node action for exiting a subcopy of the maze.
	// Moves up on the traversing graph
	exit: function(loc, dir) {
		if(!this.traversing.up) return
		var box = this.traversing.box
		var xoffset = 5
		var yoffset = 5
		if(box == 'B') xoffset += 10
		if(box == 'C') xoffset += 10, yoffset +=10
		loc = loc.slice()
		loc[0] = loc[0]/5 + xoffset
		loc[1] = loc[1]/5 + yoffset
		var node = this.nodes[loc[0] + loc[1]*25]
		this.player = [node.x, node.y]
		this.traversing = this.traversing.up
		this.camera.target.push(this.traversing)
		this.node = node
		this.auto(dir)
	},
	// Function: traverse
	// Node action for moving along a path in the maze
	traverse: function(path, dir, reverse, done) {
		if(!done) {
			done = function() { maze.auto(dir) }
		}
		if(path == this.specialpaths[0] || path == this.specialpaths[1]) {
			if(this.traversing.up)
				return
		}
		push_unique(this.traversing.paths, path)
		if(this.animate) {
			this.node = null
			var tr = this.traversing
			var speed = 0.5
			var interval = setInterval(new function(maze,path,reverse,speed,done) { var t = 0 
				return function() {
					var ctx = maze.ctx
					maze.player = path.interp(reverse ? 1-t : t)
					t += speed/path.length
					if(t >= 1) {
						clearInterval(interval)
						if(reverse) maze.node = path.start
						else maze.node = path.end
						maze.player = [maze.node.x, maze.node.y]
						done()
					}
					maze.redraw = true
			}}(this,path,reverse,speed,done), 1000/30)
		} else {
			if(reverse) this.node = path.start
			else this.node = path.end
			if(done) done()
		}
	},
	// Function: auto
	// This function causes the player to automatically progress at nodes
	// which have only 2 alternatives.
	auto: function(dir) {
		if(this.replay.length) {
			var f = this.replay.shift()
			this.go(f)
		} else if(this.follow_linearpath) {
			var choices = []
			for(var d in this.directions) {
				if((1^d) == dir) continue
				var action = this.node[this.directions[d][1]]
				if(action) choices.push(action)
			}
			
			if(choices.length == 1) this.go(choices[0])
		} 
	},
	// Function: go
	// Used to invoke node actions, and store them for the replay feature which occurs when
	// the maze is completed.
	go: function(f) {
		maze.record.push(f)
		f()
	},
	// Function: drawTraversedPaths
	// Draws used paths in the maze.
	// Used paths are drawn at a deeper level than the rest.
	drawTraversedPaths: function(ctx, traversing) {
		ctx.lineWidth = 2/this.scale
		var travesty = traversing.paths
		if(travesty) {
			ctx.save()	
				ctx.lineWidth = 4/this.scale
				ctx.globalAlpha = 0.80
				for(path in travesty) {
					travesty[path].draw(ctx,false)
				}
			ctx.restore()
		}
		if(traversing == this.traversing) {
			ctx.save()
			ctx.globalAlpha = 1.0
			ctx.lineWidth = 3/this.scale
			ctx.strokeStyle = 'rgba(0,0,0,0.75)'
			ctx.beginPath()
			ctx.arc(this.player[0], this.player[1], 12/this.scale, 0, 1, true)
			ctx.arc(this.player[0], this.player[1], 12/this.scale, 1, 0, true)
			ctx.stroke()
			ctx.restore()
		}
	},
	// Function: drawMaze
	// Just draws the maze inside the outer rect.  
	// Used to draw subcopies so that navigation is easier.
	drawMaze: function(ctx, traversing) {
		ctx.lineWidth = 2/this.scale
		ctx.strokeStyle = this.boxcolor('A')
		ctx.strokeRect(5, 5, 5, 5)
		ctx.strokeStyle = this.boxcolor('B')
		ctx.strokeRect(15, 5, 5, 5)
		ctx.strokeStyle = this.boxcolor('C')
		ctx.strokeRect(15, 15, 5, 5)
		for(path in this.paths) {
			this.paths[path].draw(ctx,true)
		}
		if(!traversing) return
		this.drawTraversedPaths(ctx, traversing)

		ctx.save()
		if(traversing.up) ctx.globalAlpha*=0.2
		for(path in this.specialpaths) this.specialpaths[path].draw(ctx)
		ctx.restore()

		ctx.save()
		ctx.translate(5+2.5, 15+2.5)
		for(var t = traversing; t.up; t = t.up) {
			ctx.strokeStyle = this.boxcolor(t.box)
			ctx.beginPath()
			ctx.arc(0,0,5/2,0,1,true)
			ctx.arc(0,0,5/2,1,0,true)
			ctx.stroke()
			ctx.scale(0.9, 0.9)
		}
		ctx.fillStyle = 'rgba(0,0,0,0.5)'
		ctx.beginPath()
		ctx.arc(0,0,5/2,0,1,true)
		ctx.arc(0,0,5/2,1,0,true)
		ctx.fill()
		ctx.restore()
	},
	// Function: draw
	// Draws the maze, subcopies and the probable supercopy.
	draw: function(traversing) {
		if(traversing === undefined) {
			traversing = this.traversing
		}
		
		var ctx = this.ctx
		ctx.clearRect(-2, -2, 30, 30)
		ctx.lineWidth = 3/this.scale
		ctx.strokeStyle = this.boxcolor(traversing.box)
		ctx.strokeRect(0, 0, 25, 25)
		this.drawMaze(ctx, traversing)
		if(traversing.up) {
			var boxoffset = this.offset(traversing.box)
			ctx.save()
			ctx.scale(5,5)
			ctx.translate(-boxoffset[0], -boxoffset[1])
			ctx.globalAlpha *= 0.25
			var old_scale = this.scale
			this.scale *= 4
			this.drawMaze(ctx, traversing.up)
			this.scale = old_scale
			ctx.restore()
		}

		for(x in {A:[],B:[],C:[]}) {
			var boxoffset = this.offset(x)
			ctx.save()
			ctx.translate(boxoffset[0], boxoffset[1])
			ctx.scale(1/5,1/5)
			ctx.globalAlpha *= 0.25
			var old_scale = this.scale
			this.scale /= 4
			this.drawMaze(ctx, traversing[x])
			if(traversing[x])
			for(y in {A:[],B:[],C:[]}) {
				if(!traversing[x][y]) continue
				var boxoffset = this.offset(y)
				ctx.save()
				ctx.translate(boxoffset[0], boxoffset[1])
				ctx.scale(1/5,1/5)
				ctx.globalAlpha *= 0.25
				var young_scale = this.scale
				this.scale /= 4
				this.drawTraversedPaths(ctx, traversing[x][y])
				this.scale = young_scale
				ctx.restore()
			}
			this.scale = old_scale
			ctx.restore()
		}
	}
})

var maze = undefined

$(function() {
	maze = new Maze($('#maze'), 400)
	maze.draw()
	
	document.onkeydown = function(key) {
		if(!key) key = window.event
		var direction = {
			37: 'west',
			38: 'north',
			39: 'east',
			40: 'south'
		}
		var code = key.charCode ? key.charCode : key.keyCode
		if(code in direction) {
			var dir = direction[code]
			if(maze.node && maze.node[dir])
			{
				maze.go(maze.node[dir])
				maze.$log.append(dir + ', ')
			}
		}
	}
})

function push_unique(a, item) {
	for(var i = 0; i < a.length; i++) 
	{
		if(a[i] == item)
			return a.length
	}

	return a.push(item)
}

function solveit(solution, discussion)
{
	if(undefined == discussion) discussion = ''
	else discussion = '<hr/>' + discussion
	maze.$log.text(solution)
	maze.reset()
	maze.animate = false
	solution = solution.split(', ')
	for(var s in solution) {
		maze.go(maze.node[solution[s]])
		maze.camera = {target:[maze.traversing],interp:1}
	}
	$('#solutions').html(discussion)
}

function long_solution()
{
	solveit(
		'north, north, west, south, west, ' + 
		'south, north, north, south, west, ' + 
		'south, north, north, south, west, ' + 
		'west, north, west, south, east, ' + 
		'east, north, east, south, west, ' +
		'west, north, west, west, west, ' + 
		'north, east, south, west, west, ' + 
		'north, west, south, east, south',
    'This solution moves methodically ' + 
	'from Red to Green to Blue, and out.' +
    'While the red-to-blue maneuver is a little involved, ' + 
	'it\'s use of all three submazes at the top level leads ' + 
	'me to believe that this was the solution intended by Mr. Wolf.' )
}

function short_solution()
{
	solveit(
		'north, north, north, west, west, ' + 
		'north, north, south, east, south, ' + 
		'north, north, south, west, west, ' + 
		'north, west, south, east, south',
	'This solution is considerably simpler than the first one. ' + 
	'It goes through Red directly to Blue, and is then forced ' + 
	'into Green, which unravels to Red and then out and out to ' + 
	'the solution. This is the first solution I could memorize.' )
}

function my_solution() 
{
    solveit(
        'north, east, east, west, west, ' + 
        'north, north, south, east, south, ' + 
        'north, north, north, west, north, ' + 
        'north, west, north, north, east, ' + 
        'south',
		'This was my attempt at entering Blue from the ' + 
		'lowest west entrance, which takes you directly to the finish. ' +
		'The simplicity in the maneuver in Blue is made up in Red, which ' + 
		'The maze seems to reward persistence.'
    )
}

function my_solution2() {
    solveit(
        'north, east, south, south, south, ' +
        'north, north, south, east, east, ' +
        'north, north, south, east, south, ' + 
        'east, south, west, west, north, ' + 
        'west, south, east, south',
		'This was my first attempt at using the little ' + 
		'Blue-to-Blue roundabout on it\'s east side to win. ' + 
		'I failed, but ended up with a satisfying solution anyway.'
    )
}

function my_solution3() {
	solveit(
		'north, north, north, west, west, ' + 
		'north, west, south, east, south, ' + 
		'west, west, north, west, south, ' + 
		'east, east, east, south',
		'This is a successful attempt at using the roundabout ' + 
		'on the east side of Blue. This solution has ' + 
		'the interesting property that it only crosses itself once...'
	)
}
