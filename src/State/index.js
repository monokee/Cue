
/**
 * Cue.State - The granular reactivity engine behind Cue.
 *
 * Has the following built-in concepts:
 * - User defined modules have declarative default properties, computed properties and actions.
 * - Modules are blueprints from which state instances can be created using factory functions.
 * - Modules are like classes but specifically optimized for reactive state modeling.
 * - Modules can import other Modules which they extend themselves with.
 * - Property change interception (willChange handlers)
 * - Change reaction handling (didChange handlers and external reactions for side-effects)
 * - Chain-able and micro-optimized computed properties
 */

// Registered State Modules: name -> lazy factory
const CUE_STATE_MODULES = new Map();

// Internals of State Modules for internally passing module data around: name -> object
const CUE_STATE_INTERNALS = new Map();

// State Flags
let isReacting = false; // is a reaction currently in process?
let isAccumulating = false; // are we accumulating observers and derivatives because a change is part of a multi-property-change action?
const accumulatedDerivatives = []; // derivatives which are accumulated during batch operations (emptied after each batch!)
// Reaction Queue
const MAIN_QUEUE = [];

// Global derivative installer payload
const DERIVATIVE_INSTALLER = {
  derivative: null,
  allProperties: null,
  derivedProperties: null
};

// Traversal Directions (needed for dependency branch walking)
const TRAVERSE_DOWN = -1;
const TRAVERSE_UP = 1;

// Meta Keys used for closure scope lookup && safely extending foreign objects
const __CUE__ = Symbol('🧿 Cue Internals');

const STATE_TYPE_INSTANCE = 1;
const STATE_TYPE_EXTENSION = 2;

// Root State Store
const CUE_ROOT_STATE = {};
oDefineProperty(CUE_ROOT_STATE, __CUE__, {
  value: {
    name: '::ROOT::',
    module: {name: '::ROOT::'},
    type: STATE_TYPE_INSTANCE,
    plainState: CUE_ROOT_STATE,
    proxyState: CUE_ROOT_STATE,
    observersOf: EMPTY_MAP,
    derivativesOf: EMPTY_MAP,
    consumersOf: EMPTY_MAP,
    providersToInstall: EMPTY_MAP,
    derivativesToInstall: EMPTY_MAP,
    internalGetters: EMPTY_MAP,
    internalSetters: EMPTY_MAP
  }
});