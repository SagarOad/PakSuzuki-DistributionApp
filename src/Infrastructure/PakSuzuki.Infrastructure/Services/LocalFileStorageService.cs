using PakSuzuki.Application.Common.Interfaces;

namespace PakSuzuki.Infrastructure.Services;

/// <summary>
/// Stores files under App_Data/uploads (outside wwwroot) so SPA builds that empty
/// wwwroot never wipe user media. URLs stay /uploads/{container}/{file} and are
/// served via a dedicated static-files mount in Program.cs.
/// </summary>
public class LocalFileStorageService : IFileStorageService
{
    private readonly string _mediaRootPath;

    public LocalFileStorageService(string mediaRootPath)
    {
        _mediaRootPath = mediaRootPath;
        Directory.CreateDirectory(_mediaRootPath);
    }

    public async Task<string> UploadAsync(Stream content, string fileName, string containerName, CancellationToken ct = default)
    {
        var safeContainer = SanitizeSegment(containerName);
        var folder = Path.Combine(_mediaRootPath, safeContainer);
        Directory.CreateDirectory(folder);

        var uniqueName = $"{Guid.NewGuid()}_{SanitizeFileName(fileName)}";
        var filePath = Path.Combine(folder, uniqueName);

        await using var fileStream = new FileStream(filePath, FileMode.Create);
        await content.CopyToAsync(fileStream, ct);

        return $"/uploads/{safeContainer}/{uniqueName}";
    }

    public Task DeleteAsync(string fileUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileUrl)) return Task.CompletedTask;

        var relative = fileUrl.Replace('\\', '/').TrimStart('/');
        if (relative.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase))
            relative = relative["uploads/".Length..];

        // Prevent path traversal outside the media root.
        var fullPath = Path.GetFullPath(Path.Combine(_mediaRootPath, relative.Replace('/', Path.DirectorySeparatorChar)));
        var rootFull = Path.GetFullPath(_mediaRootPath);
        if (!fullPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
            return Task.CompletedTask;

        if (File.Exists(fullPath)) File.Delete(fullPath);
        return Task.CompletedTask;
    }

    private static string SanitizeSegment(string value)
    {
        var cleaned = string.Join("_", value.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries)).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "misc" : cleaned;
    }

    private static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        return string.IsNullOrWhiteSpace(name) ? "file.bin" : SanitizeSegment(name);
    }
}
