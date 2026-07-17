export interface IModule {
  /**
   * Returns the name of the module.
   */
  readonly name: string;

  /**
   * Initializes the module.
   * Should throw an error if a critical failure occurs, or return false if it fails but the app can continue.
   * Returning true means successful initialization.
   */
  initialize(): Promise<boolean>;

  /**
   * Gracefully shuts down the module and cleans up resources.
   */
  shutdown(): Promise<void>;

  /**
   * Returns the current status/health of the module.
   */
  status(): any;
}
