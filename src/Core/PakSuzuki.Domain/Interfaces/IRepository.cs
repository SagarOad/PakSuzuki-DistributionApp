using System.Linq.Expressions;
using PakSuzuki.Domain.Common;

namespace PakSuzuki.Domain.Interfaces;

// Generic repository so every feature doesn't hand-roll EF queries. Kept intentionally
// thin - complex/reporting queries should go through IApplicationDbContext directly
// via specification/LINQ in the Application layer's query handlers, not bloat this interface.
public interface IRepository<T> where T : BaseEntity
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<T>> ListAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default);
    IQueryable<T> Query(); // for composable, paginated, projected queries
    Task AddAsync(T entity, CancellationToken ct = default);
    void Update(T entity);
    void Remove(T entity); // soft-delete when T implements ISoftDeletable, handled in Infrastructure
}

public interface IUnitOfWork
{
    IRepository<T> Repository<T>() where T : BaseEntity;
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
