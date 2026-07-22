using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Entities;

// City / coverage area. Distributors register under a region; retailers inherit via distributor.
// CenterLatitude/Longitude frame the map and support city-level filters.
public class Region : AuditableEntity
{
    public string Name { get; set; } = default!;
    public string Code { get; set; } = default!;
    public double CenterLatitude { get; set; }
    public double CenterLongitude { get; set; }

    public ICollection<Distributor> Distributors { get; set; } = new List<Distributor>();
    public ICollection<RegionalHeadAssignment> RegionalHeads { get; set; } = new List<RegionalHeadAssignment>();
}

// A RegionalHead (ApplicationUser) can be assigned to one or more regions.
public class RegionalHeadAssignment : AuditableEntity
{
    public Guid ApplicationUserId { get; set; }
    public Guid RegionId { get; set; }
    public Region Region { get; set; } = default!;
}
