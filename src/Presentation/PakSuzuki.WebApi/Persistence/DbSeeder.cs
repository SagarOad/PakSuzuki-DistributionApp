using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PakSuzuki.Domain.Entities;
using PakSuzuki.Domain.Enums;
using PakSuzuki.Infrastructure.Identity;
using PakSuzuki.Infrastructure.Persistence;

namespace PakSuzuki.WebApi.Persistence;

// Dev seed: roles, SuperAdmin, regions. Regions must exist before distributor registration.
public static class DbSeeder
{
    public static readonly Guid RegionKarachiId = Guid.Parse("11111111-1111-1111-1111-111111111101");
    public static readonly Guid RegionLahoreId = Guid.Parse("11111111-1111-1111-1111-111111111102");
    public static readonly Guid RegionIslamabadId = Guid.Parse("11111111-1111-1111-1111-111111111103");
    public static readonly Guid RegionMultanId = Guid.Parse("11111111-1111-1111-1111-111111111104");
    public static readonly Guid RegionFaisalabadId = Guid.Parse("11111111-1111-1111-1111-111111111105");
    public static readonly Guid RegionPeshawarId = Guid.Parse("11111111-1111-1111-1111-111111111106");
    public static readonly Guid RegionQuettaId = Guid.Parse("11111111-1111-1111-1111-111111111107");

    public static async Task SeedAsync(IServiceProvider services)
    {
        var roleManager = services.GetRequiredService<RoleManager<ApplicationRole>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var context = services.GetRequiredService<ApplicationDbContext>();

        await context.Database.MigrateAsync();

        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new ApplicationRole { Name = role });
        }

        await SeedRegionsAsync(context);

        const string superAdminEmail = "superadmin@paksuzuki.local";
        if (await userManager.FindByNameAsync(superAdminEmail) is null)
        {
            var user = new ApplicationUser { UserName = superAdminEmail, Email = superAdminEmail, EmailConfirmed = true };
            var result = await userManager.CreateAsync(user, "ChangeMe!2026");
            if (result.Succeeded)
                await userManager.AddToRoleAsync(user, Roles.SuperAdmin);
        }
    }

    private static async Task SeedRegionsAsync(ApplicationDbContext context)
    {
        var regions = new[]
        {
            new Region { Id = RegionKarachiId, Name = "Karachi", Code = "KHI", CenterLatitude = 24.8607, CenterLongitude = 67.0011 },
            new Region { Id = RegionLahoreId, Name = "Lahore", Code = "LHE", CenterLatitude = 31.5204, CenterLongitude = 74.3587 },
            new Region { Id = RegionIslamabadId, Name = "Islamabad", Code = "ISB", CenterLatitude = 33.6844, CenterLongitude = 73.0479 },
            new Region { Id = RegionMultanId, Name = "Multan", Code = "MUX", CenterLatitude = 30.1575, CenterLongitude = 71.5249 },
            new Region { Id = RegionFaisalabadId, Name = "Faisalabad", Code = "FSD", CenterLatitude = 31.4504, CenterLongitude = 73.1350 },
            new Region { Id = RegionPeshawarId, Name = "Peshawar", Code = "PEW", CenterLatitude = 34.0151, CenterLongitude = 71.5249 },
            new Region { Id = RegionQuettaId, Name = "Quetta", Code = "QTA", CenterLatitude = 30.1798, CenterLongitude = 66.9750 }
        };

        foreach (var region in regions)
        {
            var existing = await context.Regions.FirstOrDefaultAsync(r => r.Id == region.Id || r.Code == region.Code);
            if (existing is null)
            {
                context.Regions.Add(region);
            }
            else if (existing.CenterLatitude == 0 && existing.CenterLongitude == 0)
            {
                existing.CenterLatitude = region.CenterLatitude;
                existing.CenterLongitude = region.CenterLongitude;
                if (string.IsNullOrWhiteSpace(existing.Name)) existing.Name = region.Name;
            }
        }

        await context.SaveChangesAsync();
    }
}
