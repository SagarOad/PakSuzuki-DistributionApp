using MediatR;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Features.Settings;

public static class SettingKeys
{
    public const string ShipToPartyAmountThreshold = "ShipToParty:AmountThreshold";
    public const string ShipToPartyQuantityThreshold = "ShipToParty:QuantityThreshold";
}

public record SystemSettingDto(string Key, string Value);

public record GetSettingsQuery : IRequest<IReadOnlyList<SystemSettingDto>>;

public record GetSettingQuery(string Key) : IRequest<SystemSettingDto>;

public record UpsertSettingCommand(string Key, string Value) : IRequest;

public class GetSettingsQueryHandler : IRequestHandler<GetSettingsQuery, IReadOnlyList<SystemSettingDto>>
{
    private readonly IApplicationDbContext _context;
    public GetSettingsQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<IReadOnlyList<SystemSettingDto>> Handle(GetSettingsQuery request, CancellationToken ct) =>
        await _context.SystemSettings
            .OrderBy(s => s.Key)
            .Select(s => new SystemSettingDto(s.Key, s.Value))
            .ToListAsync(ct);
}

public class GetSettingQueryHandler : IRequestHandler<GetSettingQuery, SystemSettingDto>
{
    private readonly IApplicationDbContext _context;
    public GetSettingQueryHandler(IApplicationDbContext context) => _context = context;

    public async Task<SystemSettingDto> Handle(GetSettingQuery request, CancellationToken ct)
    {
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.Key == request.Key, ct);
        if (setting != null) return new SystemSettingDto(setting.Key, setting.Value);

        // Sensible defaults when not yet seeded/migrated
        var fallback = request.Key switch
        {
            SettingKeys.ShipToPartyQuantityThreshold => "1000",
            SettingKeys.ShipToPartyAmountThreshold => "10000000",
            _ => ""
        };
        return new SystemSettingDto(request.Key, fallback);
    }
}

public class UpsertSettingCommandHandler : IRequestHandler<UpsertSettingCommand>
{
    private readonly IApplicationDbContext _context;
    public UpsertSettingCommandHandler(IApplicationDbContext context) => _context = context;

    public async Task Handle(UpsertSettingCommand request, CancellationToken ct)
    {
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.Key == request.Key, ct);
        if (setting is null)
        {
            setting = new SystemSetting { Key = request.Key, Value = request.Value };
            _context.SystemSettings.Add(setting);
        }
        else
        {
            setting.Value = request.Value;
        }

        await _context.SaveChangesAsync(ct);
    }
}
