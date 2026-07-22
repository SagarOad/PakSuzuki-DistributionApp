using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Services;

// Starter implementation: stores under wwwroot/uploads so files are servable
// immediately by the same Kestrel/IIS instance. Swap for an Azure Blob Storage
// implementation later without touching any Application-layer handler.
public class LocalFileStorageService : IFileStorageService
{
    private readonly string _webRootPath;

    public LocalFileStorageService(string webRootPath) => _webRootPath = webRootPath;

    public async Task<string> UploadAsync(Stream content, string fileName, string containerName, CancellationToken ct = default)
    {
        var folder = Path.Combine(_webRootPath, "uploads", containerName);
        Directory.CreateDirectory(folder);

        var uniqueName = $"{Guid.NewGuid()}_{fileName}";
        var filePath = Path.Combine(folder, uniqueName);

        await using var fileStream = new FileStream(filePath, FileMode.Create);
        await content.CopyToAsync(fileStream, ct);

        return $"/uploads/{containerName}/{uniqueName}";
    }

    public Task DeleteAsync(string fileUrl, CancellationToken ct = default)
    {
        var relativePath = fileUrl.TrimStart('/');
        var fullPath = Path.Combine(_webRootPath, relativePath);
        if (File.Exists(fullPath)) File.Delete(fullPath);
        return Task.CompletedTask;
    }
}
