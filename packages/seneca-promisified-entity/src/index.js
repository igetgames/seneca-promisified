import Promise from 'any-promise';

/**
 * This just wraps over the object which is created when you call `make`.
 *
 * The `fields$`, `is$`, `clone$`, `data$`, `canon$`, `native$` methods all
 * work the exact same way as the original seneca entity.
 */
class SenecaEntityWrapper {
	/**
	 * @param {Object} entity - The entity returned when you call the real
	 * `seneca.make$` method.
	 */
	constructor(entity) {
		Object.defineProperty(this, '_entity', {
			value: entity
		});
	}

	/** @private */
	_forDataInWrapper(fn) {
		for(var k in this) {
			if(k[k.length - 1] !== '$'
					&& k[0] !== '_') {
				fn(this[k], k);
			}
		}
	}

	/** @private */
	_forDataInEnt(fn) {
		for(var k in this._entity) {
			if(k[k.length - 1] !== '$') {
				fn(this._entity[k], k);
			}
		}
	}

	/** @private */
	_clearEnt() {
		this._forDataInEnt((_ , k) => {
			delete this._entity[k];
		});
	}

	/** @private */
	_fromWrapperToEnt() {
		this._forDataInWrapper((val, k) => {
			this._entity[k] = val;
		});
	}

	/** @private */
	_fromEntToWrapper() {
		this._forDataInEnt((val, k) => {
			this[k] = val;
		});
	}

	/** @private */
	_callWithOpt(opt, prop) {
		return new Promise((resolve, reject) => {
			const onComplete = (err, ent) => {
				if(err) return reject(err);
				const wrapped = new SenecaEntityWrapper(ent);
				wrapped._fromEntToWrapper();
				resolve(wrapped);
			};

			if(opt !== undefined) {
				this._entity[prop](opt, onComplete);
			} else {
				// clear it to remove items which may not be
				// present in the wrapper. If they're not in
				// the wrapper they won't be overriden.
				this._clearEnt(); 
				this._fromWrapperToEnt();
				this._entity[prop](onComplete);
			}
		});
	}

	/**
	 * Saves the stored entity
	 * @param {Object} obj - Optional object to use for saving. If not specified
	 * it will use the members on the entity object itself as the data to save.
	 * @returns {Promise}
	 * @example
	 * const ent = seneca.make('person');
	 * ent.id = 1;
	 * ent.name = 'foobar';
	 * ent.save$(); // => Promise
	 */
	save$(obj) {
		return this._callWithOpt(obj, 'save$');
	}

	/**
	 * Loads an entity.
	 * @param {Object} query - Query to pass down to the internal seneca
	 * instance.
	 * @returns {Promise}
	 * @example
	 * const funnyJoe = seneca
	 *   .make('person')
	 *   .load$({ funny: true, name: 'Joe' });
	 */
	load$(query) {
		return this._callWithOpt(query, 'load$');
	}

	/**
	 * Returns a list of entities.
	 * @param {Object} query - The query to pass down to the internal seneca
	 * instance. The query dsl will depdend on what kind of module you're using
	 * with the entity module.
	 * @returns {Promise}
	 * @example
	 * const allPersons = seneca.make('person').list$({ all$: true });
	 */
	list$(query) {
		return this._callWithOpt(query, 'list$');
	}

	/**
	 * Removes the given entity
	 * @param {Object} query - The query to pass to the internal seneca instance.
	 * If not specified will use the fields stored on the entity itself.
	 * @returns {Promise}
	 * @example
	 * // Creates then removes the entity immediately.
	 * seneca
	 *   .make('person')
	 *   .save$({ name: 'foobar' })
	 *   .then((ent) => ent.remove$());
	 */
	remove$(query) {
		return this._callWithOpt(query, 'remove$');
	}
	
}

const inheritsSymbolics = [
	'fields',
	'is',
	'canon',
	'native',
	'data',
	'clone'
];

inheritsSymbolics.forEach((key) => {
	const symbolicKey = key + '$';
	SenecaEntityWrapper.prototype[symbolicKey] = function() {
		this._entity[symbolicKey].apply(this._entity, arguments);
	};
});

const make = function (...args) {
	const entity = this._seneca.make.apply(this._entity, args);
	return new SenecaEntityWrapper(entity);
};

// Need to patch the item.
module.exports = (wrapper) => {
	wrapper.make = make;
	wrapper.make$ = make;
};

module.exports.make = make;
module.exports.SenecaEntityWrapper = SenecaEntityWrapper;
