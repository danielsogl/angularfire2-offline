import { FirebaseListFactoryOpts } from 'angularfire2/interfaces';
import { Observable } from 'rxjs/Observable';

export class EmulateQuery {
  orderKey: string;
  observableValue: any[];
  observableOptions: FirebaseListFactoryOpts;
  query: AfoQuery = {};
  queryReady: Promise<{}[]>;
  constructor() { }
  /**
   * Gets the latest value of all query items, including Observable queries.
   *
   * If the query item's value is an observable, then we need to listen to that and update
   * the query when it updates.
   * @see https://goo.gl/mNVjGN
   */
  setupQuery(options: FirebaseListFactoryOpts) {
    // Store passed options
    this.observableOptions = options;
    // Ignore empty queries
    if (this.observableOptions.query === undefined) { return; }
    // Loop through query items
    this.queryReady = Promise.all(Object.keys(this.observableOptions.query).map(queryKey => {
      return new Promise(resolve => {
        // Checks if the query item is an observable
        if (this.observableOptions.query[queryKey] instanceof Observable) {
          // TODO: this should unsubscribe at some point
          this.observableOptions.query[queryKey].subscribe(value => {
            this.query[queryKey] = value;
            resolve();
          });
        // Otherwise it's a regualr query (e.g. not an Observable)
        } else {
          this.query[queryKey] = this.observableOptions.query[queryKey];
          resolve();
        }
      });
    }));
  }
  /**
   * Emulates the query that would be applied by AngularFire2
   *
   * Using format similar to [angularfire2](https://goo.gl/0EPvHf)
   */
  emulateQuery(options: FirebaseListFactoryOpts, value) {
    this.observableOptions = options;
    this.observableValue = value;
    // TODO: check if value === undefined causes unintended results
    if (this.observableOptions.query === undefined || value === undefined) {
      return new Promise(resolve => resolve(this.observableValue));
    }
    return this.queryReady.then(() => {
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

        return this.observableValue;
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

      return this.observableValue;
    });
  }
  private endAt(endValue) {
    let found = false;
    for (let i = this.observableValue.length - 1; !found && i > -1; i--) {
      if (this.observableValue[i] === endValue) {
        this.observableValue.splice(0, i + 1);
        found = true;
      }
    }
  }
  private equalTo(value, key?) {
    this.observableValue.forEach((item, index) => {
      if (item[this.orderKey] !== value) {
        this.observableValue.splice(0, index);
      }
    });
  }
  private limitToFirst(limit: number) {
    if (limit < this.observableValue.length) {
      this.observableValue = this.observableValue.slice(0, limit);
    }
  }
  private limitToLast(limit: number) {
    if (limit < this.observableValue.length) {
      this.observableValue = this.observableValue.slice(-limit);
    }
  }
  private orderByString(x) {
    if (this.observableValue === undefined) { return; }
    this.observableValue.sort((a, b) => {
      const itemA = a[x].toLowerCase();
      const itemB = b[x].toLowerCase();
      if (itemA < itemB) { return -1; }
      if (itemA > itemB) { return 1; }
      return 0;
    });
  }
  private startAt(startValue: string | number | boolean) {
    this.observableValue.some((item, index) => {
      if (item === this.observableOptions.query.startAt) {
        this.observableValue = this.observableValue.slice(-this.observableValue.length + index);
        return true;
      }
    });
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
