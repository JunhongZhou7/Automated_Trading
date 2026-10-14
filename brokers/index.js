import {AlpacaBroker} from './alpaca.js';
import {IBKRBroker} from './ibkr.js';
import {BrokerError} from './base.js';
export function createBroker(name='alpaca',options){if(name==='alpaca')return new AlpacaBroker(options);if(name==='ibkr')return new IBKRBroker();throw new BrokerError('Unknown broker.',400);}
