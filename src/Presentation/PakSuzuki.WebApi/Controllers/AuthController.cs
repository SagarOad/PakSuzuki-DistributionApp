using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Auth.Commands;

namespace PakSuzuki.WebApi.Controllers;

public class AuthController : BaseApiController
{
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResult), 200)]
    public async Task<IActionResult> Login([FromBody] LoginCommand body) =>
        Ok(await Mediator.Send(body));

    [HttpPost("send-otp")]
    [ProducesResponseType(typeof(SendOtpResult), 200)]
    public async Task<IActionResult> SendOtp([FromBody] SendOtpCommand body) =>
        Ok(await Mediator.Send(body));

    [HttpPost("verify-otp")]
    [ProducesResponseType(typeof(VerifyOtpResult), 200)]
    public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpCommand body) =>
        Ok(await Mediator.Send(body));

    [HttpPost("refresh-token")]
    [ProducesResponseType(typeof(LoginResult), 200)]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenCommand body) =>
        Ok(await Mediator.Send(body));

    [HttpPost("forgot-password")]
    [ProducesResponseType(typeof(ForgotPasswordResult), 200)]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordCommand body) =>
        Ok(await Mediator.Send(body));

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordCommand body)
    {
        await Mediator.Send(body);
        return NoContent();
    }

    [HttpPost("reset-password-otp")]
    public async Task<IActionResult> ResetPasswordWithOtp([FromBody] ResetPasswordWithOtpCommand body)
    {
        await Mediator.Send(body);
        return NoContent();
    }
}
