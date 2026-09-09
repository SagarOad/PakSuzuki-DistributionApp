using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using PakSuzuki.Infrastructure.Persistence;

#nullable disable

namespace PakSuzuki.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20260907160000_AddAppNotifications")]
public partial class AddAppNotifications : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.AppNotifications', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.AppNotifications (
                    Id uniqueidentifier NOT NULL CONSTRAINT PK_AppNotifications PRIMARY KEY,
                    UserId uniqueidentifier NOT NULL,
                    Title nvarchar(200) NOT NULL,
                    Message nvarchar(1000) NOT NULL,
                    Category nvarchar(50) NOT NULL,
                    LinkUrl nvarchar(500) NULL,
                    RelatedEntityId uniqueidentifier NULL,
                    IsRead bit NOT NULL CONSTRAINT DF_AppNotifications_IsRead DEFAULT (0),
                    ReadAtUtc datetime2 NULL,
                    CreatedAtUtc datetime2 NOT NULL,
                    CreatedBy nvarchar(max) NULL,
                    ModifiedAtUtc datetime2 NULL,
                    ModifiedBy nvarchar(max) NULL,
                    IsDeleted bit NOT NULL CONSTRAINT DF_AppNotifications_IsDeleted DEFAULT (0),
                    DeletedAtUtc datetime2 NULL,
                    DeletedBy nvarchar(max) NULL
                );
                CREATE INDEX IX_AppNotifications_User_Read_Created
                    ON dbo.AppNotifications (UserId, IsRead, CreatedAtUtc);
            END
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            IF OBJECT_ID(N'dbo.AppNotifications', N'U') IS NOT NULL
                DROP TABLE dbo.AppNotifications;
            """);
    }
}
