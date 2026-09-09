using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Features.Notifications;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
[Route("api/notifications")]
public class NotificationsController : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20) =>
        Ok(await Mediator.Send(new GetMyNotificationsQuery(pageNumber, Math.Clamp(pageSize, 1, 50))));

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount() =>
        Ok(await Mediator.Send(new GetUnreadNotificationCountQuery()));

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        await Mediator.Send(new MarkNotificationReadCommand(id));
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        await Mediator.Send(new MarkAllNotificationsReadCommand());
        return NoContent();
    }
}
