using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Features.Orders.Commands;
using PakSuzuki.Application.Features.Orders.Queries;
using PakSuzuki.Application.Features.Retailers.Queries;
using PakSuzuki.Domain.Enums;

namespace PakSuzuki.WebApi.Controllers;

[Authorize]
public class OrdersController : BaseApiController
{
    private readonly ICurrentUserService _currentUser;
    public OrdersController(ICurrentUserService currentUser) => _currentUser = currentUser;

    /// <summary>
    /// Retailer → assigned Distributor. Body is line items only; IDs come from JWT.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "RetailerOnly")]
    public async Task<IActionResult> Create(List<CreateOrderItemDto> items)
    {
        var retailerId = _currentUser.RetailerId ?? throw new UnauthorizedAccessException();
        var retailer = await Mediator.Send(new GetRetailerByIdQuery(retailerId, null));
        var id = await Mediator.Send(new CreateOrderCommand(
            OrderSourceType.RetailerOrder, retailerId, retailer.DistributorId, items));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpPost("distributor-direct")]
    [Authorize(Policy = "DistributorOnly")]
    public async Task<IActionResult> CreateDistributorDirect(List<CreateOrderItemDto> items)
    {
        var distributorId = _currentUser.DistributorId ?? throw new UnauthorizedAccessException();
        var id = await Mediator.Send(new CreateOrderCommand(
            OrderSourceType.DistributorDirectOrder, null, distributorId, items));
        return CreatedAtAction(nameof(GetById), new { id }, new { id });
    }

    [HttpGet]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string? statusFilter,
        [FromQuery] string? search,
        [FromQuery] Guid? distributorId,
        [FromQuery] Guid? retailerId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20)
    {
        Guid? distributorScope;
        Guid? retailerScope;

        if (_currentUser.Role == Roles.Distributor)
        {
            distributorScope = _currentUser.DistributorId;
            retailerScope = retailerId; // may filter to one of their retailers
            if (distributorId is not null && distributorId != distributorScope)
                return Forbid();
        }
        else if (_currentUser.Role == Roles.Retailer)
        {
            retailerScope = _currentUser.RetailerId;
            distributorScope = null;
            if (retailerId is not null && retailerId != retailerScope)
                return Forbid();
        }
        else
        {
            // SuperAdmin / Admin / RegionalHead: allow explicit filters for profile pages
            distributorScope = distributorId;
            retailerScope = retailerId;
        }

        return Ok(await Mediator.Send(new GetOrdersQuery(
            distributorScope, retailerScope, statusFilter, search, pageNumber, pageSize)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        Guid? distributorScope = _currentUser.Role == Roles.Distributor ? _currentUser.DistributorId : null;
        Guid? retailerScope = _currentUser.Role == Roles.Retailer ? _currentUser.RetailerId : null;
        return Ok(await Mediator.Send(new GetOrderByIdQuery(id, distributorScope, retailerScope)));
    }

    [HttpPost("distributor-action/{orderId:guid}")]
    [Authorize(Policy = "DistributorOnly")]
    public async Task<IActionResult> DistributorAction(Guid orderId, ApproveOrderBody body)
    {
        await Mediator.Send(new ApproveOrderCommand(orderId, body.Decision, body.Remarks, body.AmendedItems));
        return NoContent();
    }

    [HttpPost("paksuzuki-action/{orderId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> PakSuzukiAction(Guid orderId, PakSuzukiActionBody body)
    {
        await Mediator.Send(new PakSuzukiActionCommand(orderId, body.Decision, body.Remarks));
        return NoContent();
    }

    [HttpPost("submit-to-sap/{orderId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> SubmitToSap(Guid orderId)
    {
        await Mediator.Send(new SubmitOrderToSapCommand(orderId));
        return NoContent();
    }

    [HttpGet("sap-status/{orderId:guid}")]
    [Authorize]
    public async Task<IActionResult> SapStatus(Guid orderId) =>
        Ok(await Mediator.Send(new RefreshSapStatusCommand(orderId)));

    [HttpPatch("status/{orderId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> UpdateStatus(Guid orderId, UpdateOrderStatusBody body)
    {
        await Mediator.Send(new UpdateOrderStatusCommand(orderId, body.Status, body.Remarks));
        return NoContent();
    }

    [HttpGet("profit-calculation/{orderId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> ProfitCalculation(Guid orderId) =>
        Ok(await Mediator.Send(new GetOrderProfitQuery(orderId)));

    [HttpPost("proof-of-delivery/{orderId:guid}")]
    [RequestSizeLimit(50_000_000)]
    public async Task<IActionResult> UploadProofOfDelivery(Guid orderId, IFormFile file)
    {
        var role = _currentUser.Role ?? throw new UnauthorizedAccessException();
        if (role is not (Roles.Distributor or Roles.Retailer or Roles.SuperAdmin or Roles.Admin))
            throw new UnauthorizedAccessException();

        await using var stream = file.OpenReadStream();
        var id = await Mediator.Send(new UploadProofOfDeliveryCommand(
            orderId, _currentUser.UserId!.Value, role, file.FileName, stream));
        return Ok(new { id });
    }

    [HttpGet("proof-of-delivery/{orderId:guid}")]
    public async Task<IActionResult> GetProofOfDelivery(Guid orderId) =>
        Ok(await Mediator.Send(new GetProofsOfDeliveryQuery(orderId)));
}

public record ApproveOrderBody(OrderStatus Decision, string? Remarks, List<ApproveOrderItemDto>? AmendedItems);
public record PakSuzukiActionBody(OrderStatus Decision, string? Remarks);
public record UpdateOrderStatusBody(OrderStatus Status, string? Remarks);
