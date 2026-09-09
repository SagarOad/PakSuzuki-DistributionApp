using PakSuzuki.Application.Common.Interfaces;
using PakSuzuki.Application.Common.Models;
using PakSuzuki.Domain.Entities;

namespace PakSuzuki.Application.Common;

/// <summary>
/// Stores the images that arrive with a registration and keeps track of what was written, so a
/// failed registration can remove the orphan files instead of leaving them on disk / in the bucket.
/// </summary>
public sealed class RegistrationImageStore
{
    private readonly IFileStorageService _fileStorage;
    private readonly List<string> _writtenUrls = new();

    public RegistrationImageStore(IFileStorageService fileStorage) => _fileStorage = fileStorage;

    public async Task<string?> SaveProfileImageAsync(
        UploadedImage? image, string container, CancellationToken ct)
    {
        if (image is null) return null;
        var url = await _fileStorage.UploadAsync(image.Content, image.FileName, container, ct);
        _writtenUrls.Add(url);
        return url;
    }

    public async Task<List<BusinessImage>> SaveBusinessImagesAsync(
        IEnumerable<UploadedImage>? images, string container, CancellationToken ct)
    {
        var saved = new List<BusinessImage>();
        foreach (var image in images ?? Enumerable.Empty<UploadedImage>())
        {
            var url = await _fileStorage.UploadAsync(image.Content, image.FileName, container, ct);
            _writtenUrls.Add(url);
            saved.Add(new BusinessImage { StorageUrl = url, FileName = image.FileName });
        }
        return saved;
    }

    /// <summary>Deletes every file written through this store. Never throws.</summary>
    public async Task DiscardAsync(CancellationToken ct)
    {
        foreach (var url in _writtenUrls)
        {
            try { await _fileStorage.DeleteAsync(url, ct); }
            catch { /* best effort cleanup */ }
        }
        _writtenUrls.Clear();
    }
}
