'use strict';

// CommonJS package manager support.
if (typeof module !== 'undefined' && typeof exports !== 'undefined' && module.exports === exports) {
	module.exports = 'satellizer';
}

angular.module('hapilizer', []);

angular.module('hapilizer').constant('hapilizer.config', {
	httpInterceptor: function() { return true; },
	withCredentials: false,
	tokenRoot: null,
	baseUrl: '/',
	loginUrl: '/auth/login',
	registerUrl: '/auth/register',
	unlinkUrl: '/auth/unlink',
	tokenName: 'hapilizer_token',
	authHeader: 'Authorization',
	authToken: 'Bearer',
	storageType: 'localStorage',
	providers: {
		facebook: {                 // https://developers.facebook.com/docs/javascript/reference/FB.init/v2.5
			appId: undefined,
			version: 'v2.5', // or v2.0, v2.1, v2.2, v2.3, v2.4
			ready: false
		},
		linkedin: {
			clientId: undefined,
			scope: [ 'r_basicprofile', 'r_emailaddress' ],
			ready: false
		},
		google: {
			clientId: undefined,
			ready: false
		}
	}
});

angular.module('hapilizer').provider('auth', hapilizerAuth);
hapilizerAuth.$inject = ['hapilizer.config'];
function hapilizerAuth(config) {
	Object.defineProperties(this, {
		httpInterceptor: {
			get: function() { return config.httpInterceptor; },
			set: function(value) {
				if (typeof value === 'function') {
					config.httpInterceptor = value;
				} else {
					config.httpInterceptor = function() {
						return value;
					};
				}
			}
		},
		baseUrl: {
			get: function() { return config.baseUrl; },
			set: function(value) { config.baseUrl = value; }
		},
		loginUrl: {
			get: function() { return config.loginUrl; },
			set: function(value) { config.loginUrl = value; }
		},
		registerUrl: {
			get: function() { return config.signupUrl; },
			set: function(value) { config.signupUrl = value; }
		},
		tokenName: {
			get: function() { return config.tokenName; },
			set: function(value) { config.tokenName = value; }
		},
		unlinkUrl: {
			get: function() { return config.unlinkUrl; },
			set: function(value) { config.unlinkUrl = value; }
		},
		authHeader: {
			get: function() { return config.authHeader; },
			set: function(value) { config.authHeader = value; }
		},
		authToken: {
			get: function() { return config.authToken; },
			set: function(value) { config.authToken = value; }
		},
		withCredentials: {
			get: function() { return config.withCredentials; },
			set: function(value) { config.withCredentials = value; }
		},
		storageType: {
			get: function() { return config.storageType; },
			set: function(value) { config.storageType = value; }
		}
	});

	angular.forEach(Object.keys(config.providers), function(provider) {
		this[provider] = function(params) {
			return angular.extend(config.providers[provider], params);
		};
	}, this);

	this.$get = function(hapilizerInternal, hapilizerShared) {
		return {
			isAuthenticated: hapilizerShared.isAuthenticated,
			login: hapilizerInternal.login,
			authenticate: hapilizerInternal.authenticate,
			logout: hapilizerInternal.logout,
			//link: hapilizerInternal.link,   // todo
			//unlink: hapilizerInternal.unlink, // todo
			register: hapilizerInternal.register
		};
	};

	this.$get.$inject = ['hapilizer.internals', 'hapilizer.shared'];
}

angular.module('hapilizer').service('hapilizer.internals', internal);
internal.$inject = ['$http', '$q', 'hapilizerUtils', 'hapilizer.config', 'hapilizer.shared', 'hapilizer.store'];
function internal($http, $q, utils, config, shared, store) {

	this.login = function(user, opts) {
		opts = opts || {};
		opts.url = opts.url ? opts.url : utils.joinUrl(config.baseUrl, config.loginUrl);
		opts.data = user || opts.data;
		opts.method = opts.method || 'POST';
		opts.withCredentials = opts.withCredentials || config.withCredentials;

		return $http(opts).then(function(response) {
			shared.setToken(response);
			return response;
		});
	};

	this.authenticate = function(provider) {
		var deferred = $q.defer();
		if (!Object.keys(config.providers).includes(provider)) {
			return $q.reject('Provider ' + provider + ' is not supported.');
		}
		switch(provider) {

			case 'facebook':
				if (!FB instanceof Object) return $q.reject('Facebook SDK is not available');
				if (!config.facebookReady) FB.init(config.providers.facebook);
				config.facebookReady = true;
				FB.login(function(response) {
					if (response.authResponse) {
						deferred.resolve(response);
					} else {
						deferred.reject('User cancelled login or did not fully authorize.');
					}
				});
				break;

			case 'linkedin':
				if (!IN instanceof Object) return $q.reject('LinkedIn SDK is not available');
				//if (!config.facebookReady) FB.init(config.providers.facebook);
				IN.Event.on(IN, "auth", function () {
					debugger;
					//r_emailaddress
					//IN.API.Raw("/people/~:(id,first-name,last-name,email-address)").result(function(res){
					IN.API.Raw("/people/~:(id,first-name,last-name,email-address)").result(function(res){
						//socialLoginService.setProviderCookie("linkedIn");
						debugger;
						var userDetails = {name: res.firstName + " " + res.lastName, email: res.emailAddress, uid: res.id, provider: "linkedIN"}
						$rootScope.$broadcast('event:social-sign-in-success', userDetails);
					});
				});
				IN.User.authorize(function () {
					debugger;
				});
				break;

			case 'google':

				break;
		}

		return deferred.promise;
	};

	this.logout = function() {
		store.remove(config.tokenName);
		return $q.when();
	};

	this.register = function(user, opts) {
		opts = opts || {};
		opts.url = opts.url ? opts.url : utils.joinUrl(config.baseUrl, config.signupUrl);
		opts.data = user || opts.data;
		opts.method = opts.method || 'POST';
		opts.withCredentials = opts.withCredentials || config.withCredentials;

		return $http(opts);
	};
}

angular.module('hapilizer').service('hapilizer.shared', shared);
shared.$inject = ['$q', '$window', '$log', 'hapilizer.config', 'hapilizer.store'];
function shared($q, $window, $log, config, store) {

	this.isAuthenticated = function() {
		var token = store.get(config.tokenName);
		// A token is present
		if (token) {

			// Token with a valid JWT format XXX.YYY.ZZZ
			if (token.split('.').length === 3) {

				// Could be a valid JWT or an access token with the same format
				try {
					var base64Url = token.split('.')[1];
					var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
					var exp = JSON.parse($window.atob(base64)).exp;

					// JWT with an optonal expiration claims
					if (exp) {
						var isExpired = Math.round(new Date().getTime() / 1000) >= exp;
						if (isExpired) {
							// FAIL: Expired token
							return false;
						} else {
							// PASS: Non-expired token
							return true;
						}
					}
				} catch(e) {
					// PASS: Non-JWT token that looks like JWT
					return true;
				}
			}
			// PASS: All other tokens
			return true;
		}
		// FAIL: No token at all
		return false;
	};

	this.setToken = function(response) {
		if (!response) return $log.err('Can\'t set token without passing a value');
		if (response.data && typeof(response.data.access_token) === 'string') {
			return store.set(config.tokenName, response.data.access_token);
		}
		$log.err('Missing expected `access_token`.');
	};

	this.removeToken = function() {
		store.remove(config.tokenName);
	};
}
angular.module('hapilizer').service('hapilizerUtils', hapilizerUtils);
function hapilizerUtils() {
	this.joinUrl = function(baseUrl, url) {
		if (/^(?:[a-z]+:)?\/\//i.test(url)) {
			return url;
		}
		var normalize = function(str) {
			return str
				.replace(/[\/]+/g, '/')
				.replace(/\/\?/g, '?')
				.replace(/\/\#/g, '#')
				.replace(/\:\//g, '://');
		};
		var joined = [baseUrl, url].join('/');
		return normalize(joined);
	};
}

angular.module('hapilizer').service('hapilizer.store', store);
store.$inject = ['$window', '$log', 'hapilizer.config'];
function store($window, $log, config) {

	this.get = function(key) {
		return storeEnabled ? $window[config.storageType].getItem(key) : store[key];
	};

	this.set = function(key, value) {
		return storeEnabled ? $window[config.storageType].setItem(key, value) : store[key] = value;
	};

	this.remove = function(key) {
		return storeEnabled ? $window[config.storageType].removeItem(key): delete store[key];
	};

	// Check if localStorage or sessionStorage is available or enabled
	var storeEnabled = (function() {
		try {
			var supported = config.storageType in $window && $window[config.storageType] !== null;

			if (supported) {
				var key = Math.random().toString(36).substring(7);
				$window[config.storageType].setItem(key, '');
				$window[config.storageType].removeItem(key);
			}

			return supported;
		} catch (e) {
			return false;
		}
	})();

	if (!storeEnabled) {
		$log.warn(config.storageType + ' is not available.');
	}
}

angular.module('hapilizer').directive('socialSdk', scriptSocialSdk);
scriptSocialSdk.$inject = ['$log', 'hapilizer.config'];
function scriptSocialSdk ($log, config) {
	return {
		restrict: 'A',
		controllerAs: 'ctrl',
		replace: true,
		scope: {
			provider: '@'
		},
		link: function (scope, element, attrs, ctrl) {
			if (element[0].nodeName.toLowerCase() !== 'script') {
				var warnMsg = '';
				warnMsg += 'Invalid directive usage on: ' + element[0].outerHTML + '.\n';
				warnMsg += 'Directive social-sdk can only be used as attribute on <script> tag.'
				return $log.warn(warnMsg);
			}

			if (!attrs.provider) {
				var warnMsg = '';
				warnMsg += 'Invalid directive usage on: ' + element[0].outerHTML + '.\n';
				warnMsg += 'Attribute provider is required.';
				return $log.warn(warnMsg);
			}

			var src = null;
			var text = '';
			switch(attrs.provider) {
				case 'facebook':
					src = '//connect.facebook.net/en_US/sdk.js';
					break;
				case 'linkedin':
					src = '//platform.linkedin.com/in.js';
					text = '\n';
					text += '\t' + 'api_key: ' + config.providers.linkedin.clientId + '\n';
					text += '\t' + 'scope: ' + config.providers.linkedin.scope.join(' ') + '\n';
					break;
				case 'google':
					src = '//apis.google.com/js/platform.js';
					break;
				default:
					var warnMsg = '';
					warnMsg += 'Invalid directive usage on: ' + element[0].outerHTML + '.\n';
					warnMsg += 'Provider ' + attrs.provider + ' not supported';
					return $log.warn(warnMsg);
			}

			if (src != null) {
				var newElement = document.createElement('script');
				newElement.type = 'text/javascript';
				newElement.src = src;
				newElement.async = true;
				newElement.text = text;
				element.replaceWith(newElement);
			}
		}
	};
}

angular.module('hapilizer').service('hapilizerInterceptor', interceptor);
interceptor.$inject = ['$q', 'hapilizer.config', 'hapilizer.store', 'hapilizer.shared'];
function interceptor($q, config, store, shared) {
	this.request = function(request) {
			if (request.skipAuthorization) {
				return request;
			}

			if (shared.isAuthenticated() && config.httpInterceptor(request)) {
				var tokenName = config.tokenPrefix ? config.tokenPrefix + '_' + config.tokenName : config.tokenName;
				var token = store.get(tokenName);

				if (config.authHeader && config.authToken) {
					token = config.authToken + ' ' + token;
				}

				request.headers[config.authHeader] = token;
			}

		return request;
	};

	this.responseError = function(response) {
		return $q.reject(response);
	};
}

angular.module('hapilizer').config(['$httpProvider', function($httpProvider) {
	$httpProvider.interceptors.push('hapilizerInterceptor');
}]);