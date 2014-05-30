define(function(require) {

	var Origin = require('coreJS/app/origin');
	var GlobalMenuView = require('coreJS/globalMenu/views/globalMenuView');

	// Create GlobalMenu object
	var GlobalMenu = {};
	var _isActive = false;
	// Create GlobalMenu Store
	var GlobalMenuStore = new Backbone.Collection();

	// Method for adding and item to the global menu
	GlobalMenu.addItem = function(itemObject) {
		// Return if itemObject doesn't have all arguments
		if (_.size(itemObject) !== 4) {
			return console.log('Cannot add Global Menu item', itemObject.text);
		}

		itemObject._isSubMenuItem = false;
		// Push item to GlobalMenuStore
		GlobalMenuStore.add(itemObject);

	}

	// Method for adding a sub item to the global menu
	GlobalMenu.addSubItem = function(subItemObject) {
		// Return if subItemObject doesn't have all arguments
		if (_.size(subItemObject) !== 5) {
			return console.log('Cannot add Sub Menu item', subItemObject.text);
		}

		// Get parentItem
		var parentItem = GlobalMenuStore.findWhere({text: subItemObject.parent});

		// Check parentItem exists and there's only one
		if (!parentItem) {
			return console.log("Cannot add Sub Menu item as there's no parentItem", subItemObject.text);
		}

		subItemObject._isSubMenuItem = true;
		// Push item to GlobalMenuStore
		GlobalMenuStore.add(subItemObject);
	}

	// Listen to navigation event to toggle
	Origin.on('navigation:globalMenu:toggle', function() {
		// Remove all events off #app
		$('#app').off('click');
		// Toggle between displaying and removing the menu
		if (_isActive === true) {
			_isActive = false;
			// Trigger event to remove the globalMenuView
			Origin.trigger('globalMenu:globalMenuView:remove');
			// Remove body click event
		} else {
			_isActive = true;
			// Add new view to the .navigation element passing in the GlobalMenuStore as the collection
			$('.navigation').append(new GlobalMenuView({collection: GlobalMenuStore}).$el);
			// Setup listeners to #app to remove menu when main pag is clicked
			$('#app').one('click', _.bind(function(event) {
				Origin.trigger('navigation:globalMenu:toggle');
			}, this));
		}
	});

	// Added for testing purposes
	Origin.currentLocation = 'dashboard';
	
	var itemObject = {
	    "location": "global",
	    "text": "Editor",
	    "icon": "editor",
	    "callbackEvent": "editor:open"
	};

	var itemObjectTwo = {
	    "location": "dashboard",
	    "text": "Projects",
	    "icon": "editor",
	    "callbackEvent": "editor:open"
	};

	var itemObjectThree = {
	    "location": "global",
	    "text": "Dashboard",
	    "icon": "editor",
	    "callbackEvent": "dashboard:open"
	};

	var subItemObject = {
	    "parent": "Editor",
	    "location": "global",
	    "text": "Theme settings",
	    "icon": "theme",
	    "callbackEvent": "theme:settings:open"
	};

	Origin.on('app:dataReady', function() {
		GlobalMenu.addItem(itemObject);

		GlobalMenu.addItem(itemObjectTwo);

		GlobalMenu.addItem(itemObjectThree);

		GlobalMenu.addSubItem(subItemObject);
	});

	Origin.globalMenu = GlobalMenu;

});