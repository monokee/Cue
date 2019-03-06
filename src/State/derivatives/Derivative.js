
/**
 * Creates a new computed property instance.
 * @class Derivative
 */
class Derivative {

  constructor(ownPropertyName, computation, sourceProperties) {

    this.ownPropertyName = ownPropertyName;
    this.computation = computation; // the function that computes a result from data points on the source
    this.sourceProperties = sourceProperties; // property names this derivative depends on

    this.subDerivatives = []; // other derivatives that depend on this derivative. Allows for downwards traversal.
    this.superDerivatives = []; // if derivative is derived from other derivative(s), set superDerivative(s). Allows for upwards traversal.
    this.observers = [];

    this.source = undefined; // the source object the computations pull its values from

    this.intermediate = undefined; // intermediate computation result
    this._value = undefined; // current computation result
    this._type = DATA_TYPE_UNDEFINED;

    this.needsUpdate = true; // flag indicating that one or many dependencies have been updated (required by this.value getter) DEFAULT TRUE
    this.stopPropagation = false; // flag for the last observed derivative in a dependency branch (optimization)
    this.hasChanged = false; // flag indicating that the computation has yielded a new result (required for dependency traversal)

  }

  value() {

    if (this.needsUpdate === true) {

      this.intermediate = this.computation.call(this.source, this.source);

      if (isArray(this.intermediate)) {

        if ((this.hasChanged = this._type !== DATA_TYPE_ARRAY || this.intermediate.length !== this._value.length || !areArraysShallowEqual(this._value, this.intermediate))) {
          this._value = this.intermediate.slice();
          this._type = DATA_TYPE_ARRAY;
        }

      } else if (typeof this.intermediate === 'object' && this.intermediate !== null) {

        if ((this.hasChanged = this._type !== DATA_TYPE_POJO || !arePlainObjectsShallowEqual(this._value, this.intermediate))) {
          this._value = oAssign({}, this.intermediate);
          this._type = DATA_TYPE_POJO;
        }

      } else if ((this.hasChanged = this._value !== this.intermediate)) {

        this._value = this.intermediate;
        this._type = DATA_TYPE_PRIMITIVE;

      }

      this.needsUpdate = false;

    }

    return this._value;

  }

}