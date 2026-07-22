using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Auth.Commands;

namespace PakSuzuki.WebApi.Controllers;

public class AuthController : BaseApiController
{
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResult), 200)]
    public async Task<IActionResult> Login(LoginCommand command) =>
        Ok(await Mediator.Send(command));

    [HttpPost("send-otp")]
    [ProducesResponseType(typeof(SendOtpResult), 200)]
    public async Task<IActionResult> SendOtp(SendOtpCommand command) =>
        Ok(await Mediator.Send(command));

    [HttpPost("verify-otp")]
    [ProducesResponseType(typeof(VerifyOtpResult), 200)]
    public async Task<IActionResult> VerifyOtp(VerifyOtpCommand command) =>
        Ok(await Mediator.Send(command));

    [HttpPost("refresh-token")]
    [ProducesResponseType(typeof(LoginResult), 200)]
    public async Task<IActionResult> RefreshToken(RefreshTokenCommand command) =>
        Ok(await Mediator.Send(command));

    [HttpPost("forgot-password")]
    [ProducesResponseType(typeof(ForgotPasswordResult), 200)]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordCommand command) =>
        Ok(await Mediator.Send(command));

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordCommand command)
    {
        await Mediator.Send(command);
        return NoContent();
    }

    [HttpPost("reset-password-otp")]
    public async Task<IActionResult> ResetPasswordWithOtp(ResetPasswordWithOtpCommand command)
    {
        await Mediator.Send(command);
        return NoContent();
    }
}
