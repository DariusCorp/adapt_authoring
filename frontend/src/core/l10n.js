// LICENCE https://github.com/adaptlearning/adapt_authoring/blob/master/LICENSE
define(['require', 'jquery', 'polyglot', 'core/origin'], function(require, $, Polyglot, Origin) {
  var polyglot;
  // set up global l10n object
  Origin.l10n = {
    t: function(string, data) {
      if(!polyglot || !polyglot.t) {
        return string;
      }
      return polyglot.t.apply(polyglot, arguments);
    },
    has: function() {
      if(!polyglot || !polyglot.has) {
        return false;
      }
      return polyglot.has.apply(polyglot, arguments);
    }
  };
  /**
  * Initialise from language file
  */
  var locale = localStorage.getItem('lang') || 'ro';
  $.getJSON('lang/' + locale, function(data) {
    polyglot = new Polyglot({
      locale: locale,
      phrases: data,
      warn: function(message) {
        if(Origin.debug) console.warn('l10n:', message);
      }
    });
    Origin.trigger('l10n:loaded');
  }).fail(function(jqXHR, textStatus, error) {
    Origin.trigger('l10n:loaded');
  });
});
