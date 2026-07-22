namespace PakSuzuki.Application.Common.Interfaces;

// Abstraction over wherever business images / POD photos / promo banners actually
// live (local disk today, Azure Blob Storage tomorrow) without touching handlers.
public interface IFileStorageService
{
    Task<string> UploadAsync(Stream content, string fileName, string containerName, CancellationToken ct = default);
    Task DeleteAsync(string fileUrl, CancellationToken ct = default);
}
