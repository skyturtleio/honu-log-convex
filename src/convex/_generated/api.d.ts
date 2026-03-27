/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aircraft from "../aircraft.js";
import type * as airports from "../airports.js";
import type * as debug from "../debug.js";
import type * as flights from "../flights.js";
import type * as model_auth from "../model/auth.js";
import type * as model_replicateAuth from "../model/replicateAuth.js";
import type * as types from "../types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aircraft: typeof aircraft;
  airports: typeof airports;
  debug: typeof debug;
  flights: typeof flights;
  "model/auth": typeof model_auth;
  "model/replicateAuth": typeof model_replicateAuth;
  types: typeof types;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  replicate: {
    public: {
      compact: FunctionReference<
        "mutation",
        "internal",
        {
          collection: string;
          documentId: string;
          peerTimeout?: number;
          snapshotBytes: ArrayBuffer;
          stateVector: ArrayBuffer;
        },
        { removed: number; retained: number; success: boolean }
      >;
      deleteDocument: FunctionReference<
        "mutation",
        "internal",
        { collection: string; crdtBytes: ArrayBuffer; documentId: string },
        { seq: number; success: boolean }
      >;
      getInitialState: FunctionReference<
        "query",
        "internal",
        { collection: string },
        { crdtBytes: ArrayBuffer; cursor: number } | null
      >;
      insertDocument: FunctionReference<
        "mutation",
        "internal",
        { collection: string; crdtBytes: ArrayBuffer; documentId: string },
        { seq: number; success: boolean }
      >;
      mark: FunctionReference<
        "mutation",
        "internal",
        { collection: string; peerId: string; syncedSeq: number },
        null
      >;
      recovery: FunctionReference<
        "query",
        "internal",
        { clientStateVector: ArrayBuffer; collection: string },
        { cursor: number; diff?: ArrayBuffer; serverStateVector: ArrayBuffer }
      >;
      stream: FunctionReference<
        "query",
        "internal",
        {
          collection: string;
          cursor: number;
          limit?: number;
          sizeThreshold?: number;
        },
        {
          changes: Array<{
            crdtBytes: ArrayBuffer;
            documentId: string;
            operationType: string;
            seq: number;
          }>;
          compact?: string;
          cursor: number;
          hasMore: boolean;
        }
      >;
      updateDocument: FunctionReference<
        "mutation",
        "internal",
        { collection: string; crdtBytes: ArrayBuffer; documentId: string },
        { seq: number; success: boolean }
      >;
    };
  };
};
