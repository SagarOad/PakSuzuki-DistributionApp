namespace PakSuzuki.Application.Common.Interfaces;

// Wrapping DateTime.UtcNow behind an interface makes time-dependent logic
// (45-day retailer blocking rule, promotion date validation) unit-testable.
public interface IDateTimeService
{
    DateTime UtcNow { get; }
}
