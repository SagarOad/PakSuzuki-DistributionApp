using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260722160000_ExpandIncentiveModule")]
    public partial class ExpandIncentiveModule : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Incentives",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.DropColumn(
                name: "RewardValue",
                table: "Incentives");

            migrationBuilder.AddColumn<decimal>(
                name: "TargetValue",
                table: "IncentiveParticipants",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ApprovalStatus",
                table: "IncentiveParticipants",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "Pending");

            migrationBuilder.CreateTable(
                name: "IncentiveAchievementSlabs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IncentiveId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MinPercent = table.Column<decimal>(type: "decimal(8,2)", nullable: false),
                    MaxPercent = table.Column<decimal>(type: "decimal(8,2)", nullable: false),
                    IncentivePercent = table.Column<decimal>(type: "decimal(8,2)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ModifiedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ModifiedBy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DeletedBy = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IncentiveAchievementSlabs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IncentiveAchievementSlabs_Incentives_IncentiveId",
                        column: x => x.IncentiveId,
                        principalTable: "Incentives",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IncentiveAchievementSlabs_IncentiveId",
                table: "IncentiveAchievementSlabs",
                column: "IncentiveId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "IncentiveAchievementSlabs");

            migrationBuilder.DropColumn(name: "TargetValue", table: "IncentiveParticipants");
            migrationBuilder.DropColumn(name: "ApprovalStatus", table: "IncentiveParticipants");
            migrationBuilder.DropColumn(name: "Description", table: "Incentives");

            migrationBuilder.AddColumn<decimal>(
                name: "RewardValue",
                table: "Incentives",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);
        }
    }
}
