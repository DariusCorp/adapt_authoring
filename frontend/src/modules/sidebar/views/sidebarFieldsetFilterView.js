// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function (require) {
  var Origin = require('core/origin');
  var Backbone = require('backbone');

  var SidebarFieldsetFilterView = Backbone.View.extend({
    className: 'sidebar-row',
    events: {
      'click button': 'onFilterClicked'
    },

    initialize: function () {
      this.listenTo(Origin, 'remove:views', this.remove);
      this.render();
    },

    render: function () {
      const hiddenList = [
        "_globals",
        "_buttons",
        "_onScreen"
      ];
      if (hiddenList.includes(this.model.get('key'))) {
        this.model.set('_isHidden', true);
        this.model.set('class', 'display-none');
        Origin.trigger('sidebarFieldsetFilter:hideForm', this.model.get('key'))
      } else {
        this.model.set('class', '');
      }

      var data = this.model ? this.model.toJSON() : null;
      var template = Handlebars.templates[this.constructor.template];
      console.log(data);
      this.$el.html(template(data));
      return this;
    },

    onFilterClicked: function (event) {
      if (this.model.get('_isSelected')) {
        this.model.set('_isSelected', false);
        this.$('i').removeClass('fa-toggle-on');
      } else {
        this.model.set('_isSelected', true);
        this.$('i').addClass('fa-toggle-on');
      }

      Origin.trigger('sidebarFieldsetFilter:filterForm', this.model.get('key'));
    }

  }, {
    template: 'sidebarFieldsetFilter'
  });

  return SidebarFieldsetFilterView;

});
