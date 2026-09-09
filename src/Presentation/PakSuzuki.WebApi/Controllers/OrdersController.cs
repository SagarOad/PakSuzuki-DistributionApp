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
    /// Retailer → assigned Distributor. Body matches distributor-direct (items + lane fields).
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "RetailerOnly")]
    public async Task<IActionResult> Create(CreateRetailerOrderBody body)
    {
        var retailerId = _currentUser.RetailerId ?? throw new UnauthorizedAccessException();
        var retailer = await Mediator.Send(new GetRetailerByIdQuery(retailerId, null));
        var result = await Mediator.Send(new CreateOrderCommand(
            OrderSourceType.RetailerOrder,
            retailerId,
            retailer.DistributorId,
            body.Items,
            null,
            body.VendorCode,
            body.MaterialSourceCode,
            body.DeliveryTypeCode,
            body.DeliveryTypeName,
            body.SupplierCode,
            body.RetailerRemarks));
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    /// <summary>
    /// Retailer resubmits the <b>same</b> order after SentBackForModification (does not create a new order).
    /// Optional items update quantities; status returns to PendingDistributorApproval.
    /// Distributor note remains on distributorRemarks for the retailer app to show.
    /// </summary>
    [HttpPost("retailer-resubmit/{orderId:guid}")]
    [Authorize(Policy = "RetailerOnly")]
    public async Task<IActionResult> RetailerResubmit(Guid orderId, ResubmitOrderBody body)
    {
        await Mediator.Send(new ResubmitOrderCommand(orderId, body.Remarks, body.Items));
        return NoContent();
    }

    /// <summary>Retailer cancels own pending / sent-back order.</summary>
    [HttpPost("retailer-cancel/{orderId:guid}")]
    [Authorize(Policy = "RetailerOnly")]
    public async Task<IActionResult> RetailerCancel(Guid orderId, [FromBody] CancelOrderBody? body)
    {
        await Mediator.Send(new CancelRetailerOrderCommand(orderId, body?.Remarks));
        return NoContent();
    }

    [HttpPost("distributor-direct")]
    [Authorize(Policy = "DistributorOnly")]
    public async Task<IActionResult> CreateDistributorDirect(CreateDistributorDirectBody body)
    {
        var distributorId = _currentUser.DistributorId ?? throw new UnauthorizedAccessException();
        var result = await Mediator.Send(new CreateOrderCommand(
            OrderSourceType.DistributorDirectOrder,
            null,
            distributorId,
            body.Items,
            body.OriginatingRetailerOrderId,
            body.VendorCode,
            body.MaterialSourceCode,
            body.DeliveryTypeCode,
            body.DeliveryTypeName,
            body.SupplierCode));
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpGet]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string? statusFilter,
        [FromQuery] string? search,
        [FromQuery] string? source,
        [FromQuery] Guid? distributorId,
        [FromQuery] Guid? retailerId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20)
    {
        Guid? distributorScope;
        Guid? retailerScope;
        var pakSuzukiWorkQueueOnly = false;

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
            // SuperAdmin / Admin / RegionalHead: default work queue is manufacturer + Ship-to-Party only
            distributorScope = distributorId;
            retailerScope = retailerId;
            pakSuzukiWorkQueueOnly = distributorId is null && retailerId is null && source is null;
        }

        return Ok(await Mediator.Send(new GetOrdersQuery(
            distributorScope, retailerScope, statusFilter, search, source,
            pakSuzukiWorkQueueOnly, pageNumber, pageSize)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        Guid? distributorScope = _currentUser.Role == Roles.Distributor ? _currentUser.DistributorId : null;
        Guid? retailerScope = _currentUser.Role == Roles.Retailer ? _currentUser.RetailerId : null;
        return Ok(await Mediator.Send(new GetOrderByIdQuery(id, distributorScope, retailerScope)));
    }

    /// <summary>
    /// Distributor actions on a pending retailer order:
    /// ApprovedByDistributor (full from inventory),
    /// PartiallyApprovedByDistributor + amendedItems (partial from inventory),
    /// ForwardedToPakSuzuki (cannot fulfill → Pak Suzuki),
    /// SentBackForModification + amendedItems (send amendments to retailer),
    /// RejectedByDistributor.
    /// </summary>
    [HttpPost("distributor-action/{orderId:guid}")]
    [Authorize(Policy = "DistributorOnly")]
    public async Task<IActionResult> DistributorAction(Guid orderId, ApproveOrderBody body)
    {
        await Mediator.Send(new ApproveOrderCommand(
            orderId, body.Decision, body.Remarks, body.AmendedItems,
            body.FulfillmentChoice, body.PakSuzukiShipTo));
        return NoContent();
    }

    [HttpGet("middleware-pickup")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> MiddlewarePickup([FromQuery] bool pendingOnly = true) =>
        Ok(await Mediator.Send(new GetMiddlewarePickupQuery(pendingOnly)));

    [HttpPost("paksuzuki-action/{orderId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> PakSuzukiAction(Guid orderId, PakSuzukiActionBody body)
    {
        await Mediator.Send(new PakSuzukiActionCommand(orderId, body.Decision, body.Remarks, body.AmendedItems));
        return NoContent();
    }

    [HttpPost("submit-to-sap/{orderId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> SubmitToSap(Guid orderId)
    {
        await Mediator.Send(new SubmitOrderToSapCommand(orderId));
        return NoContent();
    }

    /// <summary>
    /// Re-queue an order after a SAP/middleware error. Will not create a second SAP order
    /// if a sales order number already exists.
    /// </summary>
    [HttpPost("retry-sap/{orderId:guid}")]
    [Authorize(Policy = "AdminOrAbove")]
    public async Task<IActionResult> RetrySap(Guid orderId)
    {
        await Mediator.Send(new RetrySapOrderCommand(orderId));
        return NoContent();
    }

    [HttpGet("sap-status/{orderId:guid}")]
    [Authorize]
    public async Task<IActionResult> SapStatus(Guid orderId) =>
        Ok(await Mediator.Send(new RefreshSapStatusCommand(orderId)));

    [HttpPatch("status/{orderId:guid}")]
    [Authorize]
    public async Task<IActionResult> UpdateStatus(Guid orderId, UpdateOrderStatusBody body)
    {
        // Distributors may advance delivery statuses on their own orders only.
        if (_currentUser.Role == Roles.Distributor)
        {
            if (body.Status is not (OrderStatus.PartiallyDelivered or OrderStatus.Delivered or OrderStatus.ApprovedByDistributor))
                return Forbid();
        }
        else if (_currentUser.Role is not (Roles.SuperAdmin or Roles.Admin))
        {
            return Forbid();
        }

        await Mediator.Send(new UpdateOrderStatusCommand(orderId, body.Status, body.Remarks));
        return Ok(new
        {
            title = "Order status updated.",
            orderId,
            status = body.Status.ToString(),
            message = body.Status switch
            {
                OrderStatus.PartiallyDelivered => "Delivery started (ready to ship / in process).",
                OrderStatus.Delivered => "Order marked as delivered.",
                OrderStatus.ApprovedByDistributor => "Order approved by distributor.",
                _ => $"Order status set to {body.Status}."
            }
        });
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

public record ApproveOrderBody(
    OrderStatus Decision,
    string? Remarks,
    List<ApproveOrderItemDto>? AmendedItems,
    OrderFulfillmentChoice? FulfillmentChoice = null,
    PakSuzukiShipTo? PakSuzukiShipTo = null);
public record ResubmitOrderBody(string? Remarks, List<ResubmitOrderItemDto>? Items);
public record CancelOrderBody(string? Remarks);
public record CreateRetailerOrderBody(
    List<CreateOrderItemDto> Items,
    string? VendorCode = null,
    string? MaterialSourceCode = null,
    string? DeliveryTypeCode = null,
    string? DeliveryTypeName = null,
    string? SupplierCode = null,
    string? RetailerRemarks = null);
public record CreateDistributorDirectBody(
    List<CreateOrderItemDto> Items,
    Guid? OriginatingRetailerOrderId = null,
    string? VendorCode = null,
    string? MaterialSourceCode = null,
    string? DeliveryTypeCode = null,
    string? DeliveryTypeName = null,
    string? SupplierCode = null);
public record PakSuzukiActionBody(
    OrderStatus Decision,
    string? Remarks,
    List<ApproveOrderItemDto>? AmendedItems = null);
public record UpdateOrderStatusBody(OrderStatus Status, string? Remarks);
