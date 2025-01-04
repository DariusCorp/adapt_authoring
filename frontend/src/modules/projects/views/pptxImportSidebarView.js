// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(function(require) {
  var Origin = require('core/origin');
  var SidebarItemView = require('modules/sidebar/views/sidebarItemView');

  var PptxImportSidebarView = SidebarItemView.extend({
    events: {
      'click button.cancel': 'goBack',
      'click button.save': 'importCourse'
    },

    importCourse: function(event) {
      event && event.preventDefault();
      Origin.trigger('pptxImport:completeImport', this);
    },

    goBack: function(event) {
      event && event.preventDefault();
      Origin.router.navigateToHome();
    }
  }, {

    template: 'pptxImportSidebar'

  });

  return PptxImportSidebarView;
});
