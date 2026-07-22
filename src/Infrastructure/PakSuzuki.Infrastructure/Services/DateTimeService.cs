using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Services;

public class DateTimeService : IDateTimeService
{
    public DateTime UtcNow => DateTime.UtcNow;
}
