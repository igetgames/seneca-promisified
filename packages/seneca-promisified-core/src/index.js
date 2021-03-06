/* jshint esversion: 6 */

import Promise from 'any-promise';

const completesPromise = (resolve, reject) => {
	return (err, res) => {
		if(err) return reject(err);
		resolve(res);
	};
};

/**
 * Automatically patched on the SenecaPromisified instance.
 * @memberof SenecaPromisified.prototype
 * @param {Object} args - Is the args object to pass to the next handler
 *
 * @example
 * seneca.add({ foo: 'bar' }, (args) => {
 *   return { response: 1 };
 * });
 * seneca.add({ foo: 'bar' }, (args, seneca) => {
 *   return seneca.prior(args).then(({ response }) => {
 *     return {
 *       response: response + 1
 *     };
 *   });
 * });
 *
 * seneca.act({ foo: 'bar' }).then(console.log); // => `{ response: 2 }`
 */
const prior = function(args) {
	const seneca = this._seneca;
	return new Promise((resolve, reject) => {
		seneca.prior(args, completesPromise(resolve, reject));
	});
};

/**
 * Meant to wrap the global seneca instance.
 *
 * @class SenecaPromisified
 */
class SenecaPromisified {
	constructor(seneca) {
		Object.defineProperties(this, {
			_seneca: {
				value: seneca
			},
			log: {
				value: seneca.log
			}
		});
	}

	/**
	 * Calls a seneca handler.
	 *
	 * @public
	 * @returns {Promise}
	 * @example
	 * // These all do the same thing...
	 * seneca.act('foo:true,bar:false').then(console.log);
	 * seneca.act({ foo: true, bar: false }).then(console.log);
	 * seneca.act('foo:true', { bar: false }).then(console.log);
	 */
	act(...args) {
		return new Promise((resolve, reject) => {
			this._seneca.act.apply(
				this._seneca,
				args.concat(completesPromise(resolve, reject))
			);
		});
	}

	/**
	 * This is only there to allow classes which inherit from this one to 
	 * override what the methods return. If you extend this class you should
	 * override this method to return a new instance of this one for the
	 * internals to work properly.
	 *
	 * @public
	 * @param {Object} seneca - Is the callback-base seneca instance.
	 * @returns {SenecaPromisified}
	 */
	create(seneca) {
		return new SenecaPromisified(seneca);
	}

	/**
	 * @private
	 */
	_handleResult(res, done) {
		if(typeof res.then === 'function') {
			res.then(done.bind(null, null), done);
		} else if(res instanceof Error) {
			done(err);
		} else {
			done(null, res);
		}
	}
	/**
	 * Adds a handler to the internal seneca instance.
	 *
	 * @public
	 * @example
	 * this.add({ cmd: 'foobar' }, function(args) {
	 *   return Promise.resolve('FOOBAR');
	 * });
	 */
	add(pat, ...rest) {
		const handler = rest.length > 1 ? rest[1] : rest[0];

		const handleResult = this._handleResult;
		const create = this.create;
		const wrappedHandler = function(args, done) {
			const seneca = this;
			const wrapped = create(seneca);
			wrapped.prior = prior;
			const res = handler.call(wrapped, args, wrapped);
			handleResult(res, done);
		};
		if(rest.length > 1) {
			this._seneca.add(pat, rest[0], wrappedHandler);
		} else {
			this._seneca.add(pat, wrappedHandler);
		}
	}

	/**
	 * @public
	 * @returns {Undefined}
	 * @example
	 * seneca.use((seneca) => {
	 * 	seneca.add({ cmd: 'ping' }, (args, seneca) => {
	 * 		return seneca.act({ cmd: '' });
	 * 	});
	 * });
	 *
	 * Or:
	 * seneca.use(function() {
	 * 	this.add({ cmd: 'pong' }, function(args) {
	 * 		return this.act({ cmd: 'ping' });
	 * 	});
	 * });
	 */
	use(...args) {

		// For now call the regular context...
		if(typeof args[0] === 'string') {
			return this._seneca.use.apply(this._seneca, args);
		}

		const plugin = typeof args[0] === 'string' ? args[1] : args[0];
		const create = this.create;
		const loader = function() {
			const seneca = this;
			const wrapped = create(seneca);
			plugin.call(wrapped, wrapped);
		};
		
		if(args.length > 1) {
			this._seneca.use(args[0], loader);
		} else {
			this._seneca.use(loader);
		}
	}

	/**
	 * Returns a new seneca object which will automatically add the given
	 * properties to the object you send.
	 *
	 * @public
	 * @param {Object} opts - The properties to automatically add.
	 * @returns {SenecaPromisified}
	 * @example
	 * const delegated = seneca.delegate({ safe: false });
	 * // The object submitted will also have the `safe` property.
	 * delegated.act({ cmd: 'ping' });
	 */
	delegate(opts) {
		const del = this._seneca.delegate(opts);
		return this.create(del);
	}

	/**
	 * Closes the connection established by `listen`.
	 *
	 * @public
	 * @returns {Promise}
	 */
	close() {
		return new Promise((resolve, reject) => {
			this._seneca.close((err) => err ? reject(err) : resolve());
		});
	}

	/**
	 * Similar to delegate.
	 *
	 * @public
	 * @returns {Object}
	 *
	 * @example
	 * seneca.add({ cmd: 'save', entity: 'person' }, (args) => {
	 *   return { saved: true };
	 * });
	 * seneca.add({ cmd: 'load', entity: 'person' }, (args) => {
	 *   return { loaded: true };
	 * });
	 *
	 * const pin = seneca.pin({ cmd: '*', entity: 'person' });
	 *
	 * pin.load({}).then(console.log); // => `{ loaded: true }`
	 * pin.save({}).then(console.log); // => `{ saved: true }`
	 */
	pin(pat) {
		const pinned = this._seneca.pin(pat);
		return Object.keys(pinned).reduce((accu, key) => {
			accu[key] = (args) => {
				return new Promise((resolve, reject) => {
					pinned[key](args, completesPromise(resolve, reject));
				});
			};
			return accu;
		}, {});
	}

	/**
	 * Opens a connection.
	 * @public
	 * @returns {Undefined}
	 */
	listen(opts) {
		this._seneca.listen(opts);
	}

	/**
	 * Returns a promise which will be resolved when seneca is loaded.
	 * @public
	 * @returns {Promise}
	 */
	ready() {
		return new Promise((resolve, reject) => {
			this._seneca.ready((err) => err ? reject(err) : resolve());
		});
	}

	/**
	 * Modifies the prototype to add new methods.
	 *
	 * @public
	 * @static
	 * @param {Function} fn - Side effecting function which changes the
	 * prototype.
	 */
	static use(fn) {
		return fn(SenecaPromisified.prototype);
	}

	/**
	 * Just an alternate way to instantiate the class...
	 * @static
	 */
	static create(seneca) {
		return new SenecaPromisified(seneca);
	}
}

module.exports = SenecaPromisified;
