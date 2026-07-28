using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260724180000_AddSapOutboundQueueAndOrderVariant")]
    public partial class AddSapOutboundQueueAndOrderVariant : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ProductVariantId",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VariantTypeName",
                table: "OrderItems",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SapOutboundQueues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    QueueType = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CorrelationKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ResponseJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AttemptCount = table.Column<int>(type: "int", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ProcessedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastError = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ExtJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
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
                    table.PrimaryKey("PK_SapOutboundQueues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SapOutboundQueues_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderItems_ProductVariantId",
                table: "OrderItems",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_SapOutboundQueues_OrderId",
                table: "SapOutboundQueues",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_SapOutboundQueues_QueueType",
                table: "SapOutboundQueues",
                column: "QueueType");

            migrationBuilder.CreateIndex(
                name: "IX_SapOutboundQueues_Status",
                table: "SapOutboundQueues",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SapOutboundQueues_Status_NextAttemptAtUtc",
                table: "SapOutboundQueues",
                columns: new[] { "Status", "NextAttemptAtUtc" });

            migrationBuilder.AddForeignKey(
                name: "FK_OrderItems_ProductVariants_ProductVariantId",
                table: "OrderItems",
                column: "ProductVariantId",
                principalTable: "ProductVariants",
                principalColumn: "Id",
                onDelete: ReferentialAction.NoAction);

            // Prefer quantity threshold going forward (keep amount key for backward compatibility).
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE [Key] = N'ShipToParty:QuantityThreshold')
                INSERT INTO SystemSettings (Id, [Key], [Value], CreatedAtUtc, IsDeleted)
                VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002', N'ShipToParty:QuantityThreshold', N'1000', SYSUTCDATETIME(), 0);
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_OrderItems_ProductVariants_ProductVariantId",
                table: "OrderItems");

            migrationBuilder.DropTable(name: "SapOutboundQueues");

            migrationBuilder.DropIndex(
                name: "IX_OrderItems_ProductVariantId",
                table: "OrderItems");

            migrationBuilder.DropColumn(name: "ProductVariantId", table: "OrderItems");
            migrationBuilder.DropColumn(name: "VariantTypeName", table: "OrderItems");
        }
    }
}
