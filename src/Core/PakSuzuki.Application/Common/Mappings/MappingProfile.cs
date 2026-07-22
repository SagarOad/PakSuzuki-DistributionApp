using AutoMapper;

namespace PakSuzuki.Application.Common.Mappings;

// Most query handlers in this codebase project straight to DTOs via LINQ .Select()
// (see GetProductsQuery/GetOrdersQuery) rather than AutoMapper, because projection
// keeps EF from over-fetching columns. AutoMapper is kept registered for the simpler
// 1:1 mapping cases (e.g. detail views) added as the app grows - add profiles here.
public class MappingProfile : Profile
{
    public MappingProfile()
    {
        // CreateMap<Entity, Dto>();
    }
}
