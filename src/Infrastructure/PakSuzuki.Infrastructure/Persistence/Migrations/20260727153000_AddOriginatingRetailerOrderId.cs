using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260727153000_AddOriginatingRetailerOrderId")]
    public partial class AddOriginatingRetailerOrderId : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OriginatingRetailerOrderId",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_OriginatingRetailerOrderId",
                table: "Orders",
                column: "OriginatingRetailerOrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_Orders_OriginatingRetailerOrderId",
                table: "Orders",
                column: "OriginatingRetailerOrderId",
                principalTable: "Orders",
                principalColumn: "Id",
                onDelete: ReferentialAction.NoAction);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Orders_Orders_OriginatingRetailerOrderId",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_OriginatingRetailerOrderId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "OriginatingRetailerOrderId",
                table: "Orders");
        }
    }
}
