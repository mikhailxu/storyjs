StateMachine = _.Class(function(init, states, transitions, self) {
  this.states = states;
  this.transitions = transitions;
  this.stack = [init];
  if(!this.states[init]) this.states[init] = {};
  this.self = self || {};
  _.each.call(this, states, function(state) {
    state.transitions = state.transitions || {}; 
  }); 
  _.each.call(this, transitions, function(action, when) {
    _.each.call(this, when.split(','), function(when) {
      var parts = when.split('/');
      var state = parts[0];
      var when = parts[1];
      state = this.states[state] = this.states[state] || {};
      transitions = state.transitions = state.transitions || {};
      transitions[when] = action;
    });
  });
  if(this.states[init].enter) {
    _.local.call(StateMachine, { instance: this, args: __args() }, function() {
      this.states[init].enter.apply(this.self, StateMachine.args);
    }).call(this);
  }
}, {
  proto: {
    state: function(newstate) {
      if(newstate) {
        this.stack[this.stack.length-1] = newstate;
      }
      return this.stack[this.stack.length-1];
    },
    _send: function() {
      var ev = StateMachine.event;
      var current_state = this.states[this.state()] || { transitions: {} };
      var catch_state = this.states['*'] || { transitions: {} };
      var action = current_state.transitions[ev] || current_state.transitions['*'];
      if(!action) action = catch_state.transitions[ev] || catch_state.transitions['*'];

      if(action) return action.apply(this.self, StateMachine.args);
    },
    send: function(ev) {
      var args = __args();
      return _.local.call(StateMachine, { instance: this, event: ev, args: args }, function() {
        return this._send();
      }).call(this);
    }
  },
  classic: {
    push: function(state) {
      var sm = StateMachine.instance;
      sm.stack.push(state);
      var current_state = sm.states[sm.state()] || {};
      if(current_state.enter) current_state.enter.apply(sm.self, StateMachine.args);
    },
    pop: function() {
      var sm = StateMachine.instance;
      var current_state = sm.states[sm.state()] || {};
      if(current_state.leave) current_state.leave.apply(sm.self, StateMachine.args);
      sm.stack.pop();
    },
    resend: function() {
      StateMachine.instance._send();
    },
    select: function(state) {
      var sm = StateMachine.instance;
      var current_state = sm.states[sm.state()] || {};
      if(current_state.leave) current_state.leave.apply(sm.self, StateMachine.args);
      sm.state(state);
      current_state = sm.states[state] || {};
      if(current_state.enter) current_state.enter.apply(sm.self, StateMachine.args);
    }
  }
});

jQuery.fn.litijs = function(src) {
  var emit = new StateMachine('file', {
    source: {
      enter: function() {
        this.node = $('<pre class="prettyprint"/>').appendTo(this.node);
      },
      leave: function() {
        this.node = this.node.parent();
      }
    },
    note: {
      enter: function() {
        this.node = $('<pre class="note"/>').appendTo(this.node);
      },
      leave: function() {
        this.node = this.node.parent();
      }
    },
    title: {
      enter: function() {
        this.node = $('<h1/>').appendTo(this.node);
      },
      leave: function() {
        this.node = this.node.parent();
      }
    },
    space: function() {
    },
    text: {
      enter: function() {
        this.node = $('<p/>').appendTo(this.node);
      },
      leave: function() {
        this.node = this.node.parent();
      }
    },
    example: {
      enter: function() {
        this.node = $('<pre class="prettyprint"/>').appendTo(this.node);
      },
      leave: function() {
        this.node = this.node.parent();
      }
    },
    file: {
      enter: function() {
      },
      leave: function() {
      }
    }
  }, {
    '*/*,note/source': function() {
      StateMachine.select(StateMachine.event);
      StateMachine.resend();
    },
    '*/source' : function() {
      StateMachine.instance.send('note', '');
      StateMachine.resend();
    },
    '*/note': function() {
      this.node = $('<div class="wrapper"/>').appendTo(this.node);
      StateMachine.select(StateMachine.event);
      StateMachine.resend();
    },
    'source/*': function() {
      StateMachine.select('limbo');
      this.node = this.node.parent();
      StateMachine.resend();
    },
    'note/note': function(note) {
      this.node.appendText(note);
    },
    'source/source': function(source) {
      this.node.appendText(source);
    },
    'text/space': function() {
      StateMachine.select('space');
    },
    '*/space': function() {},
    'text/text': function(line) {
      this.node.appendText(line);
    },
    'example/example': function(line) {
      this.node.appendText(line);
      this.node.append($('<br/>'));
    },
    'title/title': function(title) {
      this.node.appendText(title);
    },
    'source/source': function(source) {
      this.node.appendText(source);
    }
  }, { 
    node: 
      $('<div class="litijs">')
      .appendTo(
        $('<div class="litijs-container"/>')
        .appendTo(this)
      ) 
  });
  if(!src) src = '/javascripts/story/story_core.js';
  jQuery.get(src, function(result, status) {
    if(status == 'success') {
      _.each.call(this, jQuery.fn.litijs.parse(result), function(part) {
        emit.send(part.type, part.text);
      });
      prettyPrint(); 
    }
  });
};
jQuery.fn.litijs.parse = function(source) {
  var fn = jQuery.fn.litijs;
  var result = [];
  source.replace(/((?:[^\/]|\/[^*])+)|(\/\*(?:[^*]|\*[^\/])*\*\/)/g, function(match, source, comment) {
    if(!match || !/[^\s]/.test(match)) return "";
    else if(source) result.push({type:'source', text: match})
    else if(comment) {
      var lines = comment.split("\n");
      var html = $('<div/>');
      _.each(lines, function(line) {
        var header = line.slice(0,2);
        line = line.slice(2);
        switch(header) {
          case '--': return result.push({type: 'title', text:line});
          case ' |': 
            if(!/[^\s]/.test(line)) {
              return result.push({type: 'space', text:line});
            }
            return result.push({type: 'text', text:line});
          case ' ?': 
            if(!/[^\s]/.test(line)) {
              return result.push({type: 'space', text:line});
            }
            return result.push({type: 'note', text:line});
          case ' >': return result.push({type: 'example', text:line});
        }
      });
    }
    return '{{{' + match + '}}}';
  });
  return result;
}
    
// vim: set sw=2 ts=2 expandtab :