using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Auth.Commands;
using PakSuzuki.Application.Features.Settings;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class SettingsController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    private readonly IIdentityService _identity;

    public SettingsController(ICurrentUserService currentUser, IIdentityService identity)
    {
        _currentUser = currentUser;
        _identity = identity;
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile(CancellationToken ct)
    {
        var userId = _currentUser.UserId ?? throw new UnauthorizedAccessException();
        var profile = await _identity.GetProfileAsync(userId, ct);
        return Ok(profile);
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileBody body, CancellationToken ct)
    {
        var userId = _currentUser.UserId ?? throw new UnauthorizedAccessException();
        await _identity.UpdateProfileAsync(userId, body.UserName, body.Email, body.PhoneNumber, body.NewPassword, ct);
        return NoContent();
    }

    [HttpGet]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> GetAll() =>
        Ok(await Mediator.Send(new GetSettingsQuery()));

    [HttpGet("ship-to-party-threshold")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> GetThreshold() =>
        Ok(await Mediator.Send(new GetSettingQuery(SettingKeys.ShipToPartyAmountThreshold)));

    [HttpPut("ship-to-party-threshold")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> SaveThreshold([FromBody] ThresholdBody body)
    {
        await Mediator.Send(new UpsertSettingCommand(
            SettingKeys.ShipToPartyAmountThreshold, body.Amount.ToString("0")));
        return NoContent();
    }
}

public record UpdateProfileBody(string UserName, string Email, string? PhoneNumber, string? NewPassword);
public record ThresholdBody(decimal Amount);
