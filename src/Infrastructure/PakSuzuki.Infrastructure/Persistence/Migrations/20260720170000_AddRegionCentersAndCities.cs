using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260720170000_AddRegionCentersAndCities")]
    public partial class AddRegionCentersAndCities : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "CenterLatitude",
                table: "Regions",
                type: "float",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "CenterLongitude",
                table: "Regions",
                type: "float",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.Sql("""
                UPDATE Regions SET CenterLatitude = 24.8607, CenterLongitude = 67.0011 WHERE Code = 'KHI';
                UPDATE Regions SET CenterLatitude = 31.5204, CenterLongitude = 74.3587 WHERE Code = 'LHE';
                UPDATE Regions SET CenterLatitude = 33.6844, CenterLongitude = 73.0479 WHERE Code = 'ISB';
                """);

            // Additional cities used as distributor registration regions / map hubs.
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM Regions WHERE Code = 'MUX')
                INSERT INTO Regions (Id, Name, Code, CenterLatitude, CenterLongitude, CreatedAtUtc, IsDeleted)
                VALUES ('11111111-1111-1111-1111-111111111104', 'Multan', 'MUX', 30.1575, 71.5249, SYSUTCDATETIME(), 0);

                IF NOT EXISTS (SELECT 1 FROM Regions WHERE Code = 'FSD')
                INSERT INTO Regions (Id, Name, Code, CenterLatitude, CenterLongitude, CreatedAtUtc, IsDeleted)
                VALUES ('11111111-1111-1111-1111-111111111105', 'Faisalabad', 'FSD', 31.4504, 73.1350, SYSUTCDATETIME(), 0);

                IF NOT EXISTS (SELECT 1 FROM Regions WHERE Code = 'PEW')
                INSERT INTO Regions (Id, Name, Code, CenterLatitude, CenterLongitude, CreatedAtUtc, IsDeleted)
                VALUES ('11111111-1111-1111-1111-111111111106', 'Peshawar', 'PEW', 34.0151, 71.5249, SYSUTCDATETIME(), 0);

                IF NOT EXISTS (SELECT 1 FROM Regions WHERE Code = 'QTA')
                INSERT INTO Regions (Id, Name, Code, CenterLatitude, CenterLongitude, CreatedAtUtc, IsDeleted)
                VALUES ('11111111-1111-1111-1111-111111111107', 'Quetta', 'QTA', 30.1798, 66.9750, SYSUTCDATETIME(), 0);
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "CenterLatitude", table: "Regions");
            migrationBuilder.DropColumn(name: "CenterLongitude", table: "Regions");
        }
    }
}
