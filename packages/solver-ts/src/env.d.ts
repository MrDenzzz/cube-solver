// The engine runs in Web Workers and in Node. Both provide a monotonic clock, and that is all it
// needs from either, so it declares just that instead of pulling in the DOM or Node typings.
declare const performance: { now(): number };
