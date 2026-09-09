namespace PakSuzuki.Domain.Entities;

/// <summary>
/// One material line on a pending middleware pickup row (parts_order_line).
/// </summary>
public class PartsOrderLine
{
    public int Id { get; set; }
    public int PartsOrderId { get; set; }
    public PartsOrder PartsOrder { get; set; } = default!;

    public Guid? OrderItemId { get; set; }
    public string MaterialCode { get; set; } = default!;
    public decimal ApprovedQuantity { get; set; }
    public string Uom { get; set; } = "Carton";
}
