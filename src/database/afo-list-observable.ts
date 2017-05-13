import { FirebaseListFactoryOpts } from 'angularfire2/interfaces';
import { ReplaySubject } from 'rxjs';

import { unwrap } from './database';
import { OfflineWrite } from './offline-write';
import { LocalUpdateService } from './local-update-service';
const stringify = require('json-stringify-safe');


export class AfoListObservable<T> extends ReplaySubject<T> {
  orderKey: string;
  /**
   * The Firebase path used for the related FirebaseListObservable
   */
  path: string;
  /**
   * An array used to store write operations that require an initial value to be set
   * in {@link value} before being applied
   */
  que = [];
  query: AfoQuery = {};
  queryReady = {
    ready: false,
    promise: undefined
  };
  /**
   * Number of times updated
   */
  updated: number;
  /**
   * The current value of the {@link AfoListObservable}
   */
  value: any[];
  /**
   * The value preceding the current value.
   */
  private previousValue: any;
  /**
   * Creates the {@link AfoListObservable}
   * @param ref a reference to the related FirebaseListObservable
   * @param localUpdateService the service consumed by {@link OfflineWrite}
   */
  constructor(
    private ref,
    private localUpdateService: LocalUpdateService,
    private options: FirebaseListFactoryOpts) {
    super(1);
    this.init();
  }
   /**
   * Emulates an offline write assuming the remote data has not changed
   * @param method AngularFire2 write method to emulate
   * @param value new value to write
   * @param key optional key used with some write methods
   */
  emulate(method, value = null, key?) {
    const clonedValue = JSON.parse(JSON.stringify(value));
    if (this.value === undefined) {
      console.log('value was undefined');
      this.que.push({
        method: method,
        value: clonedValue,
        key: key
      });
      return;
    }
    this.processEmulation(method, clonedValue, key);
    this.updateSubscribers();
  }
   /**
   * - Gets the path of the reference
   * - Subscribes to the observable so that emulation is applied after there is an initial value
   */
  init() {
    this.path = this.ref.$ref.toString().substring(this.ref.$ref.database.ref().toString().length - 1);
    this.setupQuery();
    this.subscribe((newValue: any) => {
      this.value = newValue;
      if (this.que.length > 0) {
        this.que.forEach(queTask => {
          this.processEmulation(queTask.method, queTask.value, queTask.key);
        });
        this.que = [];
        this.updateSubscribers();
      }
    });
  }
  /**
   * Only calls next if the new value is unique
   */
  uniqueNext(newValue) {
    if (this.updated > 1 || (stringify(this.previousValue) !== stringify(newValue)) ) {
      this.previousValue = newValue;
      this.next(newValue);
      this.updated++;
    }
  }
  /**
   * Wraps the AngularFire2 FirebaseListObservable [push](https://goo.gl/nTe7C0) method
   *
   * - Emulates a push locally
   * - Calls the AngularFire2 push method
   * - Saves the write locally in case the browser is refreshed before the AngularFire2 promise
   * completes
   */
  push(value: any) {
    let promise = this.ref.$ref.push(value);
    const key = promise.key;

    this.emulate('push', value, key);
    OfflineWrite(
      promise,
      'object',
      `${this.path}/${key}`,
      'set',
      [value],
      this.localUpdateService);
    return promise;
  }
  /**
   * Wraps the AngularFire2 FirebaseListObservable [update](https://goo.gl/oSWgqn) method
   *
   * - Emulates a update locally
   * - Calls the AngularFire2 update method
   * - Saves the write locally in case the browser is refreshed before the AngularFire2 promise
   * completes
   */
  update(key: string, value: any) {
    this.emulate('update', value, key);
    const promise = this.ref.update(key, value);
    this.offlineWrite(promise, 'update', [key, value]);
    return promise;
  }
    /**
   * Wraps the AngularFire2 FirebaseListObservable [remove](https://goo.gl/MkZTtv) method
   *
   * - Emulates a remove locally
   * - Calls the AngularFire2 remove method
   * - Saves the write locally in case the browser is refreshed before the AngularFire2 promise
   * completes
   * @param remove if you omit the `key` parameter from `.remove()` it deletes the entire list.
   */
  remove(key?: string) {
    this.emulate('remove', null, key);
    const promise = this.ref.remove(key);
    this.offlineWrite(promise, 'remove', [key]);
    return promise;
  }
  private checkIfResolved(resolve) {
    const notFinished = Object.keys(this.options.query)
      .some(queryItem => !(queryItem in this.query));
    if (!this.queryReady.ready && !notFinished) {
      this.queryReady.ready = true;
      resolve();
    }
  }
  private emulateQuery() {
    if (this.options.query === undefined) { return; }
    this.queryReady.promise.then(() => {
      console.log('query is ready', this.value);
      // Using format similar to [angularfire2](https://goo.gl/0EPvHf)

      // Check orderBy
      if (this.query.orderByChild) {
        this.orderKey = this.query.orderByChild;
        this.orderByString(this.query.orderByChild);
      } else if (this.query.orderByKey) {
        this.orderKey = '$key';
        this.orderByString('$key');
      } else if (this.query.orderByPriority) {
        // TODO
      } else if (this.query.orderByValue) {
        this.orderKey = '$value';
        this.orderByString('$value');
      }

      // check equalTo
      if (hasKey(this.query, 'equalTo')) {
        if (hasKey(this.query.equalTo, 'value')) {
          // TODO
        } else {
          this.equalTo(this.query.equalTo);
        }

        if (hasKey(this.query, 'startAt') || hasKey(this.query, 'endAt')) {
          throw new Error('Query Error: Cannot use startAt or endAt with equalTo.');
        }

        // apply limitTos
        if (!isNil(this.query.limitToFirst)) {
          this.limitToFirst(this.query.limitToFirst);
        }

        if (!isNil(this.query.limitToLast)) {
          this.limitToLast(this.query.limitToLast);
        }

        return;
      }

      // check startAt
      if (hasKey(this.query, 'startAt')) {
        if (hasKey(this.query.startAt, 'value')) {
          // TODO
        } else {
          this.startAt(this.query.startAt);
        }
      }

      if (hasKey(this.query, 'endAt')) {
        if (hasKey(this.query.endAt, 'value')) {
          // TODO
        } else {
          this.endAt(this.query.endAt);
        }
      }

      if (!isNil(this.query.limitToFirst) && this.query.limitToLast) {
        throw new Error('Query Error: Cannot use limitToFirst with limitToLast.');
      }

      // apply limitTos
      if (!isNil(this.query.limitToFirst)) {
        this.limitToFirst(this.query.limitToFirst);
      }

      if (!isNil(this.query.limitToLast)) {
        this.limitToLast(this.query.limitToLast);
      }
    });
  }
  private endAt(endValue) {
    let found = false;
    for (let i = this.value.length - 1; !found && i > -1; i--) {
      if (this.value[i] === endValue) {
        this.value.splice(0, i + 1);
        found = true;
      }
    }
  }
  private equalTo(value, key?) {
    this.value.forEach((item, index) => {
      if (item[this.orderKey] !== value) {
        this.value.splice(0, index);
      }
    });
  }
  private limitToFirst(limit: number) {
    if (limit < this.value.length) {
      this.value = this.value.slice(0, limit);
    }
  }
  private limitToLast(limit: number) {
    if (limit < this.value.length) {
      this.value = this.value.slice(-limit);
    }
  }
   /**
   * Convenience method to save an offline write
   *
   * @param promise
   * [the promise](https://goo.gl/5VLgQm)
   * returned by calling an AngularFire2 method
   * @param type the AngularFire2 method being called
   * @param args an optional array of arguments used to call an AngularFire2 method taking the form of [newValue, options]
   */
  private offlineWrite(promise, type: string, args: any[]) {
    OfflineWrite(
      promise,
      'list',
      this.path,
      type,
      args,
      this.localUpdateService);
  }
  private orderByString(x) {
    if (this.value === undefined) { return; }
    this.value.sort((a, b) => {
      const itemA = a[x].toLowerCase();
      const itemB = b[x].toLowerCase();
      if (itemA < itemB) { return -1; }
      if (itemA > itemB) { return 1; }
      return 0;
    });
  }
  /**
   * Calculates the result of a given emulation without updating subscribers of this Observable
   *
   * - this allows for the processing of many emulations before notifying subscribers
   * @param method the AngularFire2 method being emulated
   * @param value the new value to be used by the given method
   * @param key can be used for remove and required for update
   */
  private processEmulation(method, value, key) {
    if (this.value === null) {
      this.value = [];
    }
    const newValue = unwrap(key, value, () => value !== null);
    if (method === 'push') {
      let found = false;
      this.value.forEach((item, index) => {
        if (item.$key === key) {
          this.value[index] = newValue;
          found = true;
        }
      });
      if (!found) {
        this.value.push(newValue);
      }
    } else if (method === 'update') {
      let found = false;
      this.value.forEach((item, index) => {
        if (item.$key === key) {
          found = true;
          this.value[index] = newValue;
        }
      });
      if (!found) {
        this.value.push(newValue);
      }
    } else { // `remove` is the only remaining option
      if (key === undefined) {
        this.value = [];
      } else {
        this.value.forEach((item, index) => {
          if (item.$key === key) {
            this.value.splice(index, 1);
          }
        });
      }
    }
  }
  private setupQuery() {
    if (this.options.query === undefined) { return; }
    this.queryReady.promise = new Promise(resolve => {
      Object.keys(this.options.query).forEach(queryKey => {
        const queryItem = this.options.query[queryKey];
        if (typeof queryItem === 'object' && 'subscribe' in queryItem) {
          this.options.query[queryKey].subscribe(value => {
            this.query[queryKey] = value;
            this.checkIfResolved(resolve);
          });
        } else {
          this.query[queryKey] = this.options.query[queryKey];
        }
      });
      this.checkIfResolved(resolve);
    });
  }
  private startAt(startValue: string | number | boolean) {
    this.value.some((item, index) => {
      if (item === this.options.query.startAt) {
        this.value = this.value.slice(-this.value.length + index);
        return true;
      }
    });
  }
  /**
   * Sends the the current {@link value} to all subscribers
   */
  private updateSubscribers() {
    console.log('updating subscribers');
    this.emulateQuery();
    this.uniqueNext(<any>this.value);
  }
}

export interface AfoQuery {
  [key: string]: any;
}

export function isNil(obj: any): boolean {
  return obj === undefined || obj === null;
}

export function hasKey(obj: Object, key: string): boolean {
  return obj && obj[key] !== undefined;
}
