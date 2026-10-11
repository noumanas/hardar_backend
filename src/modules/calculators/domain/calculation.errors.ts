/** Raised when calculator input breaks a domain rule (e.g. end date before start date). */
export class InvalidCalculationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidCalculationInputError.name;
  }
}
